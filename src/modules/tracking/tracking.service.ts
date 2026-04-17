import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { FraudDetectionService } from './fraud.service';

interface GpsPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMs?: number;
  altitudeM?: number;
  recordedAt: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private fraud: FraudDetectionService,
    private eventEmitter: EventEmitter2,
  ) {}

  async startWalkSession(petFriendId: string, taskId: string) {
    // Verify task belongs to this sitter's active booking
    const task = await this.prisma.bookingTask.findUnique({
      where: { id: taskId },
      include: { booking: true, pet: true },
    });

    if (!task) throw new NotFoundException('Task not found.');
    if (task.booking.petFriendId !== petFriendId) throw new ForbiddenException('Not your task.');
    if (task.booking.status !== 'active') {
      throw new BadRequestException('Booking is not active.');
    }
    if (task.taskType !== 'walk') {
      throw new BadRequestException('This is not a walk task.');
    }
    if (task.status === 'completed') {
      throw new BadRequestException('This task is already completed.');
    }

    // Check no other active walk for this sitter
    const activeWalk = await this.prisma.walkSession.findFirst({
      where: { petFriendId, isComplete: false },
    });
    if (activeWalk) {
      throw new BadRequestException({
        error: 'WALK_ALREADY_ACTIVE',
        message: 'You have an active walk session. Please end it before starting a new one.',
      });
    }

    // Get all pets in this booking
    const petIds = (
      await this.prisma.bookingPet.findMany({
        where: { bookingId: task.bookingId },
        select: { petId: true },
      })
    ).map((bp) => bp.petId);

    const session = await this.prisma.walkSession.create({
      data: {
        taskId,
        bookingId: task.bookingId,
        petFriendId,
        petIds,
        startTime: new Date(),
      },
    });

    // Store session in Redis for fast live tracking
    await this.redis.hset(`walk:${session.id}`, {
      petFriendId,
      bookingId: task.bookingId,
      ownerId: task.booking.parentId,
      startTime: session.startTime.toISOString(),
      totalDistanceM: '0',
      lastLat: '0',
      lastLng: '0',
    });

    // Notify owner
    this.eventEmitter.emit('walk.started', {
      sessionId: session.id,
      petFriendId,
      ownerId: task.booking.parentId,
      bookingId: task.bookingId,
    });

    this.logger.log(`Walk session ${session.id} started by sitter ${petFriendId}`);
    return session;
  }

  async addTrackingPoints(sessionId: string, petFriendId: string, points: GpsPoint[]) {
    // Validate session
    const session = await this.prisma.walkSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Walk session not found.');
    if (session.petFriendId !== petFriendId) throw new ForbiddenException('Not your walk session.');
    if (session.isComplete) throw new BadRequestException('Walk session is already complete.');

    // Sort points by timestamp (important for offline batch uploads)
    const sortedPoints = [...points].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );

    // Fraud checks
    const fraudFlags = await this.fraud.analyzePoints(session, sortedPoints);
    if (fraudFlags.length > 0) {
      this.logger.warn(`Fraud flags for session ${sessionId}: ${fraudFlags.join(', ')}`);
      // Don't reject — log and flag for review
      await this.prisma.walkSession.update({
        where: { id: sessionId },
        data: { isFraudFlagged: true, fraudReason: fraudFlags.join('; ') },
      });
    }

    // Store points
    await this.prisma.walkTrackingPoint.createMany({
      data: sortedPoints.map((p) => ({
        sessionId,
        lat: p.lat,
        lng: p.lng,
        accuracyM: p.accuracyM,
        speedMs: p.speedMs,
        altitudeM: p.altitudeM,
        recordedAt: new Date(p.recordedAt),
      })),
      skipDuplicates: true,
    });

    // Calculate incremental distance
    const addedDistance = this.calculateDistance(sortedPoints);

    // Update session stats
    await this.prisma.walkSession.update({
      where: { id: sessionId },
      data: {
        totalDistanceM: { increment: addedDistance },
      },
    });

    // Update Redis for live tracking
    const lastPoint = sortedPoints[sortedPoints.length - 1];
    const sessionData = await this.redis.hgetall(`walk:${sessionId}`);
    const totalDistance = (Number(sessionData?.totalDistanceM || 0) + addedDistance).toString();

    await this.redis.hset(`walk:${sessionId}`, {
      totalDistanceM: totalDistance,
      lastLat: lastPoint.lat.toString(),
      lastLng: lastPoint.lng.toString(),
      lastUpdate: lastPoint.recordedAt,
    });

    // Emit WebSocket event for live tracking
    this.eventEmitter.emit('walk.locationUpdate', {
      sessionId,
      ownerId: sessionData?.ownerId,
      lat: lastPoint.lat,
      lng: lastPoint.lng,
      totalDistanceM: Number(totalDistance),
    });

    return {
      pointsReceived: sortedPoints.length,
      totalDistanceM: Number(totalDistance),
      fraudFlags,
    };
  }

  async endWalkSession(sessionId: string, petFriendId: string, notes?: string) {
    const session = await this.prisma.walkSession.findUnique({
      where: { id: sessionId },
      include: { task: true },
    });

    if (!session) throw new NotFoundException('Walk session not found.');
    if (session.petFriendId !== petFriendId) throw new ForbiddenException('Not your walk session.');
    if (session.isComplete) throw new BadRequestException('Walk session already ended.');

    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

    // Minimum walk duration check
    if (durationSeconds < 5 * 60) {
      // Less than 5 minutes
      await this.prisma.walkSession.update({
        where: { id: sessionId },
        data: { isFraudFlagged: true, fraudReason: 'walk_too_short' },
      });
    }

    const avgSpeedKmh =
      session.totalDistanceM > 0
        ? (Number(session.totalDistanceM) / 1000 / (durationSeconds / 3600))
        : 0;

    const updatedSession = await this.prisma.walkSession.update({
      where: { id: sessionId },
      data: {
        endTime,
        durationSeconds,
        avgSpeedKmh,
        isComplete: true,
      },
    });

    // Mark task as completed
    await this.prisma.bookingTask.update({
      where: { id: session.taskId },
      data: {
        status: 'completed',
        completedAt: endTime,
        completedById: petFriendId,
        notes,
      },
    });

    // Clean up Redis
    await this.redis.del(`walk:${sessionId}`);

    // Notify owner
    this.eventEmitter.emit('walk.ended', {
      sessionId,
      petFriendId,
      task: session.task,
      stats: {
        distanceM: Number(session.totalDistanceM),
        durationSeconds,
        avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
      },
    });

    return {
      id: updatedSession.id,
      distanceM: Number(session.totalDistanceM),
      distanceKm: (Number(session.totalDistanceM) / 1000).toFixed(2),
      durationSeconds,
      durationMinutes: Math.round(durationSeconds / 60),
      avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
    };
  }

  async getLiveWalkData(sessionId: string, requestingUserId: string) {
    const session = await this.prisma.walkSession.findUnique({
      where: { id: sessionId },
      include: { booking: { select: { parentId: true, petFriendId: true } } },
    });

    if (!session) throw new NotFoundException('Walk session not found.');

    // Only owner and sitter can view live tracking
    if (
      session.booking.parentId !== requestingUserId &&
      session.petFriendId !== requestingUserId
    ) {
      throw new ForbiddenException('Access denied.');
    }

    // Get recent GPS points (last 200 points for route display)
    const recentPoints = await this.prisma.walkTrackingPoint.findMany({
      where: { sessionId },
      orderBy: { recordedAt: 'desc' },
      take: 200,
      select: { lat: true, lng: true, recordedAt: true },
    });

    const liveData = await this.redis.hgetall(`walk:${sessionId}`);

    return {
      sessionId,
      isActive: !session.isComplete,
      startTime: session.startTime,
      totalDistanceM: Number(session.totalDistanceM),
      durationSeconds: Math.floor(
        (Date.now() - session.startTime.getTime()) / 1000,
      ),
      currentLocation: {
        lat: Number(liveData?.lastLat || 0),
        lng: Number(liveData?.lastLng || 0),
        lastUpdate: liveData?.lastUpdate,
      },
      routePoints: recentPoints.reverse(),
    };
  }

  // Haversine formula for distance calculation
  private calculateDistance(points: GpsPoint[]): number {
    if (points.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += this.haversine(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng,
      );
    }
    return Math.round(totalDistance);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
