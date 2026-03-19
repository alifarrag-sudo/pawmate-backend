import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface SitterCandidate {
  id: string;
  userId: string;
  displayName: string;
  avgRating: number;
  reliabilityScore: number;
  distanceKm: number;
  responseRate: number;
  experienceYears: number;
  isSuperSitter: boolean;
  isFeatured: boolean;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notifications: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  async checkSitterAvailability(sitterId: string, start: Date, end: Date): Promise<boolean> {
    // 1. Check for conflicting bookings in DB
    const conflict = await this.prisma.booking.findFirst({
      where: {
        sitterId,
        status: { in: ['accepted', 'active'] },
        requestedStart: { lt: end },
        requestedEnd: { gt: start },
      },
    });
    if (conflict) return false;

    // 2. Check if sitter is on holiday
    const profile = await this.prisma.sitterProfile.findUnique({
      where: { userId: sitterId },
      select: { isOnHoliday: true, holidayEndDate: true, isActive: true },
    });
    if (!profile?.isActive) return false;
    if (profile.isOnHoliday && profile.holidayEndDate && profile.holidayEndDate >= start) return false;

    // 3. Check weekly template
    const dayOfWeek = start.getDay();
    const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    // Check date override first
    const dateStr = start.toISOString().split('T')[0];
    const override = await this.prisma.sitterAvailabilityOverride.findFirst({
      where: {
        sitterId: (await this.prisma.sitterProfile.findUnique({ where: { userId: sitterId }, select: { id: true } }))?.id,
        overrideDate: new Date(dateStr),
      },
    });

    if (override) {
      if (!override.isAvailable) return false;
      if (override.startTime && override.endTime) {
        return startTime >= override.startTime && endTime <= override.endTime;
      }
      return true;
    }

    // Check weekly template
    const sitterProfileRecord = await this.prisma.sitterProfile.findUnique({ where: { userId: sitterId }, select: { id: true } });
    if (!sitterProfileRecord) return false;

    const template = await this.prisma.sitterAvailabilityTemplate.findFirst({
      where: { sitterId: sitterProfileRecord.id, dayOfWeek },
    });

    if (!template) return false;
    return startTime >= template.startTime && endTime <= template.endTime;
  }

  async findCandidatesForBooking(
    ownerLat: number,
    ownerLng: number,
    serviceType: string,
    petTypes: string[],
    petSizes: string[],
    start: Date,
    end: Date,
  ): Promise<SitterCandidate[]> {
    // Raw query to use PostGIS for distance calculation
    const candidates = await this.prisma.$queryRaw<any[]>`
      SELECT
        sp.id,
        sp.user_id,
        u.first_name || ' ' || LEFT(u.last_name, 1) || '.' as display_name,
        sp.avg_rating,
        sp.reliability_score,
        sp.response_rate,
        sp.experience_years,
        sp.is_super_sitter,
        sp.is_featured,
        ST_Distance(
          ST_MakePoint(sp.lng::float, sp.lat::float)::geography,
          ST_MakePoint(${ownerLng}::float, ${ownerLat}::float)::geography
        ) / 1000 AS distance_km
      FROM sitter_profiles sp
      JOIN users u ON u.id = sp.user_id
      WHERE
        sp.is_active = true
        AND u.is_active = true
        AND u.is_banned = false
        AND u.id_verified = true
        AND sp.is_on_holiday = false
        AND ${serviceType} = ANY(sp.services)
        AND ST_DWithin(
          ST_MakePoint(sp.lng::float, sp.lat::float)::geography,
          ST_MakePoint(${ownerLng}::float, ${ownerLat}::float)::geography,
          sp.service_radius_km * 1000
        )
        AND sp.user_id NOT IN (
          SELECT sitter_id FROM bookings
          WHERE status IN ('accepted', 'active', 'pending')
          AND requested_start < ${end}
          AND requested_end > ${start}
        )
      ORDER BY distance_km ASC
      LIMIT 50
    `;

    // Filter by pet type/size (array overlap check — Prisma raw returns as strings)
    return candidates.filter((c) => {
      const sitterPetTypes = c.pet_types || [];
      const sitterPetSizes = c.pet_sizes || [];
      return (
        petTypes.every((t) => sitterPetTypes.includes(t)) &&
        petSizes.every((s) => sitterPetSizes.includes(s))
      );
    });
  }

  scoreSitter(sitter: SitterCandidate): number {
    const distanceScore = Math.max(0, 1 - sitter.distanceKm / 10);
    const ratingScore = (sitter.avgRating || 0) / 5.0;
    const reliabilityScore = (sitter.reliabilityScore || 100) / 100;
    const responseScore = (sitter.responseRate || 100) / 100;
    const experienceScore = Math.min(sitter.experienceYears || 0, 5) / 5;

    const superSitterBonus = sitter.isSuperSitter ? 0.1 : 0;
    const featuredBonus = sitter.isFeatured ? 0.05 : 0;

    const score =
      ratingScore * 0.30 +
      reliabilityScore * 0.25 +
      distanceScore * 0.20 +
      responseScore * 0.15 +
      experienceScore * 0.10 +
      superSitterBonus +
      featuredBonus;

    return Math.min(score, 1.5);
  }

  async routeBookingToNextSitter(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        pets: { include: { pet: true } },
        owner: { select: { id: true } },
      },
    });

    if (!booking || booking.status !== 'pending') {
      this.logger.log(`Routing skipped for booking ${bookingId}: status=${booking?.status}`);
      return;
    }

    const routingHistory = (booking.routingHistory as any[]) || [];
    const triedSitterIds = routingHistory.map((h: any) => h.sitterId);

    if (routingHistory.length >= 10) {
      // Exhausted attempts
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'no_sitters_available' },
      });
      this.eventEmitter.emit('booking.noSittersAvailable', { booking });
      return;
    }

    // Get next best candidate (excluding already-tried sitters)
    const petTypes = [...new Set(booking.pets.map((bp) => bp.pet.species))];
    const petSizes = [...new Set(booking.pets.map((bp) => bp.pet.weightCategory).filter(Boolean))];

    const candidates = await this.findCandidatesForBooking(
      Number(booking.serviceLat),
      Number(booking.serviceLng),
      booking.serviceType,
      petTypes,
      petSizes as string[],
      booking.requestedStart,
      booking.requestedEnd,
    );

    const nextSitter = candidates
      .filter((c) => !triedSitterIds.includes(c.userId))
      .map((c) => ({ ...c, score: this.scoreSitter(c) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!nextSitter) {
      // No more candidates
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'no_sitters_available' },
      });
      this.eventEmitter.emit('booking.noSittersAvailable', { booking });
      return;
    }

    // Update booking with new sitter
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        sitterId: nextSitter.userId,
        routingAttempt: { increment: 1 },
      },
    });

    // Notify new sitter
    this.eventEmitter.emit('booking.routedToSitter', { booking, newSitterId: nextSitter.userId });
    this.logger.log(`Booking ${bookingId} routed to sitter ${nextSitter.userId} (attempt ${routingHistory.length + 1})`);
  }

  async refreshAvailabilityIndex(): Promise<void> {
    // Pre-compute available sitters per city/service/hour for fast lookup
    // Run every 5 minutes by cron
    this.logger.log('Refreshing sitter availability index...');
    // Implementation: query available sitters and store in Redis sorted sets
    // Key: sitters:available:{city}:{serviceType}:{hourBlock}
    // Score: match score (for sorting)
  }
}
