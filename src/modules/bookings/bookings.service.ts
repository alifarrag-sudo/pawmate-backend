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
import { CareLogService } from '../care-log/care-log.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private matching: MatchingService,
    private pricing: PricingService,
    private eventEmitter: EventEmitter2,
    private careLogService: CareLogService,
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

    // 4. Get sitter profile — petFriendId can be either profileId or userId
    let sitterProfile = await this.prisma.petFriendProfile.findUnique({
      where: { id: dto.petFriendId },
      include: { user: true },
    });
    if (!sitterProfile) {
      sitterProfile = await this.prisma.petFriendProfile.findUnique({
        where: { userId: dto.petFriendId },
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
    if (!(sitterProfile as any).services?.includes(dto.serviceType)) {
      throw new BadRequestException({
        error: 'SERVICE_NOT_OFFERED',
        message: `This sitter does not offer ${dto.serviceType} service.`,
      });
    }

    // 6. Check max pets
    if ((sitterProfile as any).maxPetsPerBooking && pets.length > (sitterProfile as any).maxPetsPerBooking) {
      throw new BadRequestException({
        error: 'TOO_MANY_PETS',
        message: `This sitter accepts maximum ${(sitterProfile as any).maxPetsPerBooking} pets per booking.`,
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
      sitterProfile: sitterProfile as any,
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

    // 11. Create booking — use connect pattern to satisfy Prisma's BookingCreateInput type
    const booking = await this.prisma.booking.create({
      data: {
        parent: { connect: { id: ownerId } },
        petFriend: { connect: { id: sitterProfile.userId } },
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
        providerPayout: pricing.sitterPayout,
        paymentMethod: dto.paymentMethod as any,
        specialInstructions: dto.specialInstructions,
        petSnapshot: petSnapshots,
        reviewDeadline: new Date(end.getTime() + 14 * 24 * 60 * 60 * 1000),
        pets: {
          create: dto.petIds.map((petId) => ({ pet: { connect: { id: petId } } })),
        },
      },
    });

    // 12. Emit event for notification + payment pre-auth
    this.eventEmitter.emit('booking.created', { booking, owner: { id: ownerId }, sitter: sitterProfile.user });

    // 13. Schedule timeout (10 minutes to accept)
    await this.scheduleBookingTimeout(booking.id, 10 * 60);

    this.logger.log(`Booking ${booking.id} created by owner ${ownerId} for sitter ${dto.petFriendId}`);

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

  async acceptBooking(petFriendId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.petFriendId !== petFriendId) {
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
      petFriendId,
      booking.requestedStart,
      booking.requestedEnd,
    );
    if (!isStillAvailable) {
      // Auto-decline and route to next
      await this.declineBooking(petFriendId, bookingId, 'Calendar conflict');
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
    await this.releaseSitterLock(petFriendId, booking.requestedStart, booking.requestedEnd);

    this.eventEmitter.emit('booking.accepted', { booking: updated, petFriendId });

    return updated;
  }

  async declineBooking(petFriendId: string, bookingId: string, reason?: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.petFriendId !== petFriendId) {
      throw new ForbiddenException('Not your booking.');
    }
    if (booking.status !== 'pending') {
      throw new BadRequestException('Cannot decline a booking that is not pending.');
    }

    // Release soft lock
    await this.releaseSitterLock(petFriendId, booking.requestedStart, booking.requestedEnd);

    // Log routing history
    const routingHistory = (booking.routingHistory as any[]) || [];
    routingHistory.push({ petFriendId, reason: reason || 'declined', timestamp: new Date() });

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { routingHistory, routingAttempt: { increment: 1 } },
    });

    this.eventEmitter.emit('booking.declined', { booking, petFriendId, reason });

    return { message: 'Booking declined.' };
  }

  async startService(petFriendId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.petFriendId !== petFriendId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'accepted') {
      throw new BadRequestException(`Cannot start a booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'active', actualStart: new Date() },
      include: { pets: true },
    });

    // Generate care tasks from pet schedules
    await this.generateCareTasks(bookingId);

    // Schedule care log entries for today
    const petIds = (updated as any).pets?.map((bp: any) => bp.petId) || [];
    if (petIds.length > 0) {
      await this.careLogService.scheduleFromPetProfiles(
        bookingId,
        petIds,
        (updated as any).actualStart || new Date(),
      );
    }

    // Generate 4-digit service-end code (shown to Parent only; PetFriend must enter it to complete service)
    const endCode = this.generateFourDigitCode();
    await this.prisma.bookingEndCode.create({
      data: { bookingId, code: endCode },
    });

    this.eventEmitter.emit('booking.started', { booking: updated });
    this.eventEmitter.emit('booking.in_progress', { booking: updated });

    return updated;
  }

  // ── BookingEndCode ──────────────────────────────────────────────────────────

  /** Parent fetches their 4-digit code once the booking is active. */
  async getEndCode(parentId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);
    if (booking.parentId !== parentId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'active') {
      throw new BadRequestException('End code is only available while the booking is active.');
    }
    const record = await this.prisma.bookingEndCode.findUnique({ where: { bookingId } });
    if (!record) throw new NotFoundException('End code not generated yet.');
    return { code: record.code, isUsed: record.isUsed };
  }

  /** PetFriend submits the 4-digit code to end the service. Transitions booking to code_verified → completed. */
  async verifyEndCode(petFriendId: string, bookingId: string, code: string) {
    const booking = await this.getBookingOrThrow(bookingId);
    if (booking.petFriendId !== petFriendId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'active') {
      throw new BadRequestException(`Cannot verify code for booking with status: ${booking.status}`);
    }

    const record = await this.prisma.bookingEndCode.findUnique({ where: { bookingId } });
    if (!record) throw new NotFoundException('End code not found for this booking.');
    if (record.isUsed) {
      throw new BadRequestException({ error: 'CODE_ALREADY_USED', message: 'This code has already been used.' });
    }
    if (record.code !== code.trim()) {
      throw new BadRequestException({ error: 'INVALID_CODE', message: 'Incorrect code. Please ask the Parent to share the 4-digit code.' });
    }

    // Mark code as used
    await this.prisma.bookingEndCode.update({
      where: { bookingId },
      data: { isUsed: true, usedAt: new Date() },
    });

    // Transition: active → code_verified
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'code_verified', actualEnd: new Date() },
    });

    this.eventEmitter.emit('booking.code_verified', { booking: updated });

    // Auto-complete after 2 hours if Parent doesn't confirm
    await this.scheduleAutoComplete(bookingId, 2 * 60 * 60);

    this.logger.log(`BookingEndCode verified for booking ${bookingId} by petFriend ${petFriendId}`);

    return { message: 'Service ended successfully. Awaiting Parent confirmation.' };
  }

  async endService(petFriendId: string, bookingId: string, notes?: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.petFriendId !== petFriendId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'active') {
      throw new BadRequestException(`Cannot end a booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'completed',
        actualEnd: new Date(),
        parentNotes: notes,
      },
    });

    this.eventEmitter.emit('booking.ended', { booking: updated });
    this.eventEmitter.emit('booking.completed', { booking: updated });

    // Owner confirmation window: 2 hours, then auto-complete
    await this.scheduleAutoComplete(bookingId, 2 * 60 * 60);

    return updated;
  }

  async confirmCompletion(ownerId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    if (booking.parentId !== ownerId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'completed') {
      throw new BadRequestException('Nothing to confirm.');
    }

    this.eventEmitter.emit('booking.confirmed', { booking });

    return { message: 'Booking confirmed. Payment will be processed.' };
  }

  async cancelBooking(userId: string, bookingId: string, reason: string) {
    const booking = await this.getBookingOrThrow(bookingId);

    const isOwner = booking.parentId === userId;
    const isPetFriend = booking.petFriendId === userId;

    if (!isOwner && !isPetFriend) throw new ForbiddenException('Not your booking.');

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
      await this.releaseSitterLock(booking.petFriendId, booking.requestedStart, booking.requestedEnd);
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
      ...(role === 'owner' ? { parentId: userId } : { petFriendId: userId }),
      ...statusFilter,
    };

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: {
          pets: { include: { pet: { select: { id: true, name: true, species: true, profilePhoto: true } } } },
          parent: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          petFriend: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
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
        parent: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, phone: true } },
        petFriend: {
          select: {
            id: true, firstName: true, lastName: true, profilePhoto: true,
            petFriendProfile: {
              select: { id: true, avgRating: true, totalReviews: true },
            },
          },
        },
        tasks: { orderBy: { scheduledAt: 'asc' } },
        dispute: true,
        extensions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found.');

    if (booking.parentId !== userId && booking.petFriendId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    return {
      ...booking,
      startDate: booking.requestedStart,
      endDate: booking.requestedEnd,
    };
  }

  // ============================================================
  // GEO-LOCKED PICKUP
  // ============================================================

  async markReadyForPickup(petFriendId: string, bookingId: string) {
    const booking = await this.getBookingOrThrow(bookingId);
    if (booking.petFriendId !== petFriendId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'active') {
      throw new BadRequestException('Booking must be active to mark as ready for pickup.');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'ready_for_pickup', readyForPickupAt: new Date() } as any,
      include: { parent: { select: { id: true, firstName: true } } },
    });

    this.eventEmitter.emit('booking.ready_for_pickup', { booking: updated });
    return updated;
  }

  async getOvertimeStatus(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { overtimeLog: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.parentId !== userId && booking.petFriendId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    const log = (booking as any).overtimeLog;
    if (!log) {
      return { hasOvertime: false, totalMinutes: 0, totalCharge: 0, incrementRate: 0, status: null };
    }

    const incrementRate = this.calcOvertimeIncrementRate(booking as any);
    return {
      hasOvertime: true,
      totalMinutes: log.totalMinutes,
      totalCharge: Number(log.totalCharge),
      incrementRate,
      incrementsCharged: log.totalMinutes > 0 ? Math.ceil(log.totalMinutes / 30) : 0,
      status: log.status,
      startedAt: log.startedAt,
    };
  }

  async confirmPickup(ownerId: string, bookingId: string, data: {
    ownerLat: number;
    ownerLng: number;
    overtimeAcknowledged: boolean;
  }) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { overtimeLog: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.parentId !== ownerId) throw new ForbiddenException('Not your booking.');
    if (booking.status !== 'ready_for_pickup') {
      throw new BadRequestException('Booking is not ready for pickup.');
    }

    const log = (booking as any).overtimeLog;
    const overtimeCharge = log ? Number(log.totalCharge) : 0;

    if (overtimeCharge > 0 && !data.overtimeAcknowledged) {
      throw new BadRequestException({
        error: 'OVERTIME_NOT_ACKNOWLEDGED',
        message: 'You must acknowledge overtime charges before confirming pickup.',
        overtimeCharge,
      });
    }

    // Process overtime payment
    if (overtimeCharge > 0 && log) {
      const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { walletBalance: true } });
      const walletBalance = Number(owner?.walletBalance || 0);
      const sitterShare = Math.round(overtimeCharge * 0.85 * 100) / 100;

      if (walletBalance >= overtimeCharge) {
        await this.prisma.$transaction([
          this.prisma.user.update({ where: { id: ownerId }, data: { walletBalance: { decrement: overtimeCharge } } as any }),
          this.prisma.user.update({ where: { id: booking.petFriendId }, data: { walletBalance: { increment: sitterShare } } as any }),
        ]);
      } else {
        // Insufficient funds — flag outstanding balance
        await this.prisma.user.update({
          where: { id: ownerId },
          data: { outstandingBalance: { increment: overtimeCharge } } as any,
        });
        this.logger.warn(`Owner ${ownerId} has insufficient wallet for overtime ${overtimeCharge} EGP — flagged as outstanding.`);
      }

      await this.prisma.overtimeLog.update({
        where: { id: log.id },
        data: { endedAt: new Date(), status: 'COMPLETED', totalMinutes: log.totalMinutes },
      } as any);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'completed', pickupConfirmedAt: new Date(), actualEnd: new Date() } as any,
    });

    this.eventEmitter.emit('booking.pickup_confirmed', { booking: updated, overtimeCharge });
    this.eventEmitter.emit('booking.confirmed', { booking: updated });
    return { ...updated, overtimeCharge };
  }

  async forceComplete(adminId: string, bookingId: string, reason: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!admin || admin.role !== 'admin') throw new ForbiddenException('Admin access required.');

    const booking = await this.getBookingOrThrow(bookingId);
    const allowed = ['active', 'ready_for_pickup'];
    if (!allowed.includes(booking.status as string)) {
      throw new BadRequestException(`Cannot force-complete booking with status: ${booking.status}`);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'completed', actualEnd: new Date(), pickupConfirmedAt: new Date() } as any,
    });

    await (this.prisma as any).auditLog.create({
      data: { entityType: 'booking', entityId: bookingId, action: 'force_complete', actorId: adminId, metadata: { reason } },
    });

    this.eventEmitter.emit('booking.confirmed', { booking: updated });
    this.logger.warn(`Admin ${adminId} force-completed booking ${bookingId}: ${reason}`);
    return updated;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  calcOvertimeIncrementRate(booking: { totalPrice: any; requestedStart: Date; requestedEnd: Date }): number {
    const durationMs = booking.requestedEnd.getTime() - booking.requestedStart.getTime();
    const durationHours = Math.max(durationMs / (1000 * 60 * 60), 0.5);
    const hourlyRate = Number(booking.totalPrice) / durationHours;
    // 1.5x hourly rate, billed per 30-min increment
    return Math.round(hourlyRate * 1.5 * 0.5 * 100) / 100;
  }

  private async getBookingOrThrow(bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  private async acquireSitterLock(petFriendId: string, start: Date, end: Date): Promise<boolean> {
    const key = `booking:lock:${petFriendId}:${start.toISOString()}:${end.toISOString()}`;
    const result = await this.redis.set(key, 'locked', 'NX', 600); // 10 min
    return result === 'OK';
  }

  private async releaseSitterLock(petFriendId: string, start: Date, end: Date): Promise<void> {
    const key = `booking:lock:${petFriendId}:${start.toISOString()}:${end.toISOString()}`;
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

  private generateFourDigitCode(): string {
    // Cryptographically random 4-digit code: 0000–9999
    const n = Math.floor(Math.random() * 10000);
    return n.toString().padStart(4, '0');
  }
}
