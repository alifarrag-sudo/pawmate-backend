import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matching: MatchingService,
    private pricing: PricingService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createBooking(ownerId: string, dto: CreateBookingDto) {
    // 1. Validate future dates
    const now = new Date();
    const start = new Date(dto.requestedStart);
    const end = new Date(dto.requestedEnd);

    if (start <= new Date(now.getTime() + 60 * 60 * 1000)) {
      throw new BadRequestException({
        error: 'BOOKING_START_TOO_SOON',
        message: 'Booking must start at least 1 hour from now.',
      });
    }
    if (end <= start) {
      throw new BadRequestException({
        error: 'INVALID_BOOKING_DURATION',
        message: 'End time must be after start time.',
      });
    }

    // 2. Validate pets belong to owner
    const pets = await this.prisma.pet.findMany({
      where: { id: { in: dto.petIds }, ownerId, isActive: true },
    });
    if (pets.length !== dto.petIds.length) {
      throw new BadRequestException({
        error: 'INVALID_PETS',
        message: 'One or more pets not found or do not belong to you.',
      });
    }

    // 3. Self-booking check is done after we resolve the profile (below)

    // 4. Get sitter profile — sitterId can be either profileId or userId
    let sitterProfile = await this.prisma.sitterProfile.findUnique({
      where: { id: dto.sitterId },
      include: { user: true },
    });
    if (!sitterProfile) {
      sitterProfile = await this.prisma.sitterProfile.findUnique({
        where: { userId: dto.sitterId },
        include: { user: true },
      });
    }

    if (!sitterProfile || !sitterProfile.isActive) {
      throw new NotFoundException({
        error: 'SITTER_NOT_AVAILABLE',
        message: 'Sitter not found or not available for bookings.',
      });
    }

    // 3b. Owner cannot book themselves
    if (ownerId === sitterProfile.userId) {
      throw new BadRequestException({
        error: 'CANNOT_BOOK_SELF',
        message: 'You cannot book yourself as a sitter.',
      });
    }

    // 5. Check sitter offers the requested service
    if (!sitterProfile.services.includes(dto.serviceType)) {
      throw new BadRequestException({
        error: 'SERVICE_NOT_OFFERED',
        message: `This sitter does not offer ${dto.serviceType} service.`,
      });
    }

    // 6. Check max pets
    if (pets.length > sitterProfile.maxPetsPerBooking) {
      throw new BadRequestException({
        error: 'TOO_MANY_PETS',
        message: `This sitter accepts maximum ${sitterProfile.maxPetsPerBooking} pets per booking.`,
      });
    }

    // 7. Check sitter availability (DB + soft lock) using resolved User ID
    const isAvailable = await this.matching.checkSitterAvailability(sitterProfile.userId, start, end);
    if (!isAvailable) {
      throw new ConflictException({
        error: 'SITTER_NOT_AVAILABLE',
        message: 'This sitter is not available for the selected time slot.',
      });
    }

    // 8. Acquire soft lock
    const lockAcquired = await this.acquireSitterLock(sitterProfile.userId, start, end);
    if (!lockAcquired) {
      throw new ConflictException({
        error: 'TIMESLOT_LOCKED',
        message: 'This time slot is temporarily reserved. Please try again in a moment.',
      });
    }

    // 9. Calculate price
    const pricing = this.pricing.calculate({
      bookingType: dto.bookingType,
      startTime: start,
      endTime: end,
      petCount: pets.length,
      sitterProfile,
    });

    // 10. Create pet snapshots (frozen pet data)
    const petSnapshots = pets.map((pet) => ({
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      weightKg: pet.weightKg?.toString(),
      profilePhoto: pet.profilePhoto,
    }));

    // 11. Create booking — always store sitterProfile.userId (User ID) in Booking.sitterId
    const booking = await this.prisma.booking.create({
      data: {
        ownerId,
        sitterId: sitterProfile.userId,
        bookingType: dto.bookingType,
        serviceType: dto.serviceType as any,
        status: 'pending',
        requestedStart: start,
        requestedEnd: end,
        serviceLocationType: dto.serviceLocationType as any,
        serviceLat: dto.serviceLat,
        serviceLng: dto.serviceLng,
        serviceAddress: dto.serviceAddress,
        basePrice: pricing.basePrice,
        commissionRate: pricing.commissionRate,
        commissionAmount: pricing.commissionAmount,
        totalPrice: pricing.totalPrice,
        sitterPayout: pricing.sitterPayout,
        paymentMethod: dto.paymentMethod as any,
        specialInstructions: dto.specialInstructions,
        petSnapshot: petSnapshots,
        reviewDeadline: new Date(end.getTime() + 14 * 24 * 60 * 60 * 1000),
        pets: {
          create: dto.petIds.map((petId) => ({ petId })),
        },
      },
    });

    // 12. Emit event for notification + payment pre-auth
    this.eventEmitter.emit('booking.created', { booking, owner: { id: ownerId }, sitter: sitterProfile.user });

    // 13. Schedule timeout (10 minutes to accept)
    await this.scheduleBookingTimeout(booking.id, 10 * 60);

    this.logger.log(`Booking ${booking.id} created by owner ${ownerId} for sitter ${dto.sitterId}`);

    return {
      id: booking.id,
      status: booking.status,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      pricing: {
        basePrice: Number(pricing.basePrice),
        totalPrice: Number(pricing.totalPrice),
        sitterEarns: Number(pricing.sitterPayout),
        currency: 'EGP',
      },
    };
  }

  async acceptBooking(sitterId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.sitterId !== sitterId) {
      throw new ForbiddenException({ error: 'NOT_YOUR_BOOKING', message: 'This booking is not assigned to you.' });
    }

    if (booking.status !== 'pending') {
      throw new BadRequestException({
        error: 'BOOKING_NOT_PENDING',
        message: `Cannot accept a booking with status: ${booking.status}`,
      });
    }

    // Confirm availability one more time (race condition guard)
    const isStillAvailable = await this.matching.checkSitterAvailability(
      sitterId,
      booking.requestedStart,
      booking.requestedEnd,
    );
    if (!isStillAvailable) {
      // Auto-decline and route to next
      await this.declineBooking(sitterId, bookingId, 'Calendar conflict');
      throw new ConflictException({
        error: 'CALENDAR_CONFLICT',
        message: 'You have a conflicting booking. Request declined automatically.',
      });
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'accepted' },
    });

    // Release soft lock → hard lock is the DB record
    await this.releaseSitterLock(sitterId, booking.requestedStart, booking.requestedEnd);

    this.eventEmitter.emit('booking.accepted', { booking: updated, sitterId });

    return updated;
  }

  async declineBooking(sitterId: string, bookingId: string, reason?: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.sitterId !== sitterId) {
      throw new ForbiddenException('Not your booking.');
    }
    if (booking.status !== 'pending') {
      throw new BadRequestException('Cannot decline a booking that is not pending.');
    }

    // Release soft lock
    await this.releaseSitterLock(sitterId, booking.requestedStart, booking.requestedEnd);

    // Log routing history
    const routingHistory = (booking.routingHistory as any[]) || [];
    routingHistory.push({ sitterId, reason: reason || 'declined', timestamp: new Date() });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { routingHistory, routingAttempt: { increment: 1 } },
    });

    this.eventEmitter.emit('booking.declined', { booking, sitterId, reason });

    return { message: 'Booking declined.' };
  }

  async startService(sitterId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.sitterId !== sitterId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'accepted') {
      throw new BadRequestException(`Cannot start a booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'active', actualStart: new Date() },
    });

    // Generate care tasks from pet schedules
    await this.generateCareTasks(bookingId);

    this.eventEmitter.emit('booking.started', { booking: updated });

    return updated;
  }

  async endService(sitterId: string, bookingId: string, notes?: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.sitterId !== sitterId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'active') {
      throw new BadRequestException(`Cannot end a booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'completed',
        actualEnd: new Date(),
        ownerNotes: notes,
      },
    });

    this.eventEmitter.emit('booking.ended', { booking: updated });

    // Owner confirmation window: 2 hours, then auto-complete
    await this.scheduleAutoComplete(bookingId, 2 * 60 * 60);

    return updated;
  }

  async confirmCompletion(ownerId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.ownerId !== ownerId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'completed') {
      throw new BadRequestException('Nothing to confirm.');
    }

    this.eventEmitter.emit('booking.confirmed', { booking });

    return { message: 'Booking confirmed. Payment will be processed.' };
  }

  async cancelBooking(userId: string, bookingId: string, reason: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    const isOwner = booking.ownerId === userId;
    const isSitter = booking.sitterId === userId;

    if (!isOwner && !isSitter) throw new ForbiddenException('Not your booking.');

    const cancellableStatuses: BookingStatus[] = ['pending', 'accepted'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException({
        error: 'CANNOT_CANCEL',
        message: `Cannot cancel a booking with status: ${booking.status}. Use dispute for active bookings.`,
      });
    }

    const cancelledBy = isOwner ? 'owner' : 'sitter';
    const now = new Date();
    const hoursBeforeStart = (booking.requestedStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    let cancellationType: any;
    if (cancelledBy === 'owner') {
      if (hoursBeforeStart > 24) cancellationType = 'owner_24h_plus';
      else if (hoursBeforeStart > 1) cancellationType = 'owner_24h_minus';
      else cancellationType = 'owner_1h_minus';
    } else {
      cancellationType = 'sitter_cancel';
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledById: userId,
        cancelledAt: now,
        cancellationReason: reason,
        cancellationType,
      },
    });

    // Release soft lock if still pending
    if (booking.status === 'pending') {
      await this.releaseSitterLock(booking.sitterId, booking.requestedStart, booking.requestedEnd);
    }

    this.eventEmitter.emit('booking.cancelled', {
      booking,
      cancelledBy,
      cancellationType,
      hoursBeforeStart,
    });

    return { message: 'Booking cancelled.' };
  }

  async getMyBookings(userId: string, role: 'owner' | 'sitter', status?: string, page = 1, limit = 10) {
    // Support comma-separated status values: 'pending,confirmed,active'
    const statusFilter = status
      ? status.includes(',')
        ? { status: { in: status.split(',') } }
        : { status }
      : {};

    const where: any = {
      ...(role === 'owner' ? { ownerId: userId } : { sitterId: userId }),
      ...statusFilter,
    };

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: {
          pets: { include: { pet: { select: { id: true, name: true, species: true, profilePhoto: true } } } },
          owner: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          sitter: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const normalized = bookings.map((b) => ({
      ...b,
      startDate: b.requestedStart,
      endDate: b.requestedEnd,
    }));

    return {
      bookings: normalized,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getBookingDetail(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        pets: {
          include: {
            pet: {
              include: {
                medicalInfo: true,
                medications: { where: { isActive: true } },
                schedules: { where: { isActive: true } },
                behavior: true,
              },
            },
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, phone: true } },
        sitter: {
          select: {
            id: true, firstName: true, lastName: true, profilePhoto: true,
            sitterProfile: {
              select: { id: true, avgRating: true, totalReviews: true, hourlyRate: true, dailyRate: true, services: true },
            },
          },
        },
        tasks: { orderBy: { scheduledAt: 'asc' } },
        dispute: true,
        extensions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found.');

    if (booking.ownerId !== userId && booking.sitterId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    return {
      ...booking,
      startDate: booking.requestedStart,
      endDate: booking.requestedEnd,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async getBookingOrThrow(bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  private async acquireSitterLock(sitterId: string, start: Date, end: Date): Promise<boolean> {
    const key = `booking:lock:${sitterId}:${start.toISOString()}:${end.toISOString()}`;
    const result = await this.redis.set(key, 'locked', 'NX', 600); // 10 min
    return result === 'OK';
  }

  private async releaseSitterLock(sitterId: string, start: Date, end: Date): Promise<void> {
    const key = `booking:lock:${sitterId}:${start.toISOString()}:${end.toISOString()}`;
    await this.redis.del(key);
  }

  private async scheduleBookingTimeout(bookingId: string, seconds: number): Promise<void> {
    // Stored in Redis; cron job checks and processes
    await this.redis.setex(`booking:pending:${bookingId}`, seconds, '1');
  }

  private async scheduleAutoComplete(bookingId: string, seconds: number): Promise<void> {
    await this.redis.setex(`booking:autocomplete:${bookingId}`, seconds, '1');
  }

  private async generateCareTasks(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        pets: { include: { pet: { include: { schedules: { where: { isActive: true } } } } } },
      },
    });

    if (!booking) return;

    const tasks: any[] = [];
    const startDate = booking.actualStart || booking.requestedStart;
    const endDate = booking.requestedEnd;

    for (const bookingPet of booking.pets) {
      const pet = bookingPet.pet;
      for (const schedule of pet.schedules) {
        // Generate tasks for each day of the booking
        const current = new Date(startDate);
        while (current <= endDate) {
          const [hour, minute] = schedule.scheduledTime.split(':').map(Number);
          const taskTime = new Date(current);
          taskTime.setHours(hour, minute, 0, 0);

          if (taskTime >= startDate && taskTime <= endDate) {
            // Grace period: 30 min for feeding, 15 min for medication, 45 min for walk
            const graceMinutes = schedule.scheduleType === 'medication' ? 15 : schedule.scheduleType === 'walk' ? 45 : 30;
            const dueBy = new Date(taskTime.getTime() + graceMinutes * 60 * 1000);

            tasks.push({
              bookingId,
              petId: pet.id,
              taskType: schedule.scheduleType,
              taskName: `${schedule.scheduleType === 'feeding' ? 'Feed' : schedule.scheduleType === 'walk' ? 'Walk' : 'Medication for'} ${pet.name}`,
              scheduledAt: taskTime,
              dueBy,
              notes: schedule.notes,
            });
          }

          current.setDate(current.getDate() + 1);
        }
      }
    }

    if (tasks.length > 0) {
      await this.prisma.bookingTask.createMany({ data: tasks });
    }
  }
}
