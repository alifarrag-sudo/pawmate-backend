/**
 * Suite 1 — Parent Booking Critical Path
 *
 * Tests the booking state machine at the service level by calling
 * BookingsService and ReviewsService methods in sequence with mocked
 * Prisma, Redis, and supporting services.
 */

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { MatchingService } from '../../src/modules/bookings/matching.service';
import { PricingService } from '../../src/modules/bookings/pricing.service';
import { CareLogService } from '../../src/modules/care-log/care-log.service';
import { ReviewsService } from '../../src/modules/reviews/reviews.service';
import { ReputationService } from '../../src/modules/reviews/reputation.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { createUser } from '../factories/user.factory';
import { createBooking, createCompletedBooking } from '../factories/booking.factory';
import { createReview } from '../factories/review.factory';

// ── Mock factories for dependency services ──────────────────────────────────

function createMockMatchingService() {
  return {
    checkSitterAvailability: jest.fn().mockResolvedValue(true),
  };
}

function createMockPricingService() {
  return {
    calculate: jest.fn().mockReturnValue({
      basePrice: 150,
      commissionRate: 15,
      commissionAmount: 23,
      totalPrice: 150,
      sitterPayout: 127,
      currency: 'EGP',
      lineItems: [],
    }),
  };
}

function createMockCareLogService() {
  return {
    scheduleFromPetProfiles: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockReputationService() {
  return {
    computeSnapshot: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockNotifications() {
  return {
    sendSms: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendPush: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockConfigService() {
  const config: Record<string, string> = {
    PLATFORM_COMMISSION_PERCENT: '15',
    PAYMOB_HMAC_SECRET: 'test-hmac-secret',
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue),
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Parent Booking Critical Path', () => {
  let ctx: TestContext;
  let bookingsService: BookingsService;
  let reviewsService: ReviewsService;

  const owner = createUser({ id: 'owner-1' });
  const sitter = createUser({ id: 'sitter-1', roles: ['PETFRIEND'], isPetFriend: true });

  beforeEach(async () => {
    ctx = await buildTestModule([
      BookingsService,
      ReviewsService,
      ReputationService,
      { provide: MatchingService, useValue: createMockMatchingService() },
      { provide: PricingService, useValue: createMockPricingService() },
      { provide: CareLogService, useValue: createMockCareLogService() },
      { provide: NotificationsService, useValue: createMockNotifications() },
      { provide: ConfigService, useValue: createMockConfigService() },
    ]);

    bookingsService = ctx.module.get(BookingsService);
    reviewsService = ctx.module.get(ReviewsService);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: Complete booking lifecycle
  // ────────────────────────────────────────────────────────────────────────

  it('should complete the full booking lifecycle: create → accept → start → end', async () => {
    const bookingId = 'booking-lifecycle-1';
    const futureStart = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3h
    const futureEnd = new Date(Date.now() + 5 * 60 * 60 * 1000);   // +5h

    const sitterProfile = {
      id: 'profile-1',
      userId: sitter.id,
      isActive: true,
      services: ['dog_walking'],
      maxPetsPerBooking: 5,
      user: sitter,
    };

    const petData = { id: 'pet-1', name: 'Buddy', species: 'dog', ownerId: owner.id, isActive: true, breed: 'Lab', weightKg: 25, profilePhoto: null };

    // ── Phase 1: createBooking ──────────────────────────────────────────

    ctx.prisma.pet.findMany.mockResolvedValue([petData]);
    ctx.prisma.petFriendProfile.findUnique
      .mockResolvedValueOnce(null)         // first lookup by profileId
      .mockResolvedValueOnce(sitterProfile); // second lookup by userId

    // Mock Redis set for soft lock
    ctx.redis.set.mockResolvedValue('OK');

    const pendingBooking = createBooking({
      id: bookingId,
      parentId: owner.id,
      petFriendId: sitter.id,
      status: 'pending',
      requestedStart: futureStart,
      requestedEnd: futureEnd,
    });

    ctx.prisma.booking.create.mockResolvedValue(pendingBooking);

    const createResult = await bookingsService.createBooking(owner.id, {
      petFriendId: sitter.id,
      petIds: ['pet-1'],
      requestedStart: futureStart.toISOString(),
      requestedEnd: futureEnd.toISOString(),
      bookingType: 'hourly',
      serviceType: 'dog_walking',
      serviceLocationType: 'sitter_home',
      paymentMethod: 'platform_wallet',
    } as any);

    expect(createResult.id).toBe(bookingId);
    expect(createResult.status).toBe('pending');
    expect(ctx.eventSpy.hasEvent('booking.created')).toBe(true);

    // ── Phase 2: acceptBooking ──────────────────────────────────────────

    ctx.prisma.booking.findUnique.mockResolvedValue(pendingBooking);

    const acceptedBooking = { ...pendingBooking, status: 'accepted' };
    ctx.prisma.booking.update.mockResolvedValue(acceptedBooking);

    const acceptResult = await bookingsService.acceptBooking(sitter.id, bookingId);

    expect(acceptResult.status).toBe('accepted');
    expect(ctx.eventSpy.hasEvent('booking.accepted')).toBe(true);

    // ── Phase 3: startService ───────────────────────────────────────────

    ctx.prisma.booking.findUnique.mockResolvedValue(acceptedBooking);

    const activeBooking = {
      ...acceptedBooking,
      status: 'active',
      actualStart: new Date(),
      pets: [{ petId: 'pet-1' }],
    };
    ctx.prisma.booking.update.mockResolvedValue(activeBooking);

    // Mock generateCareTasks internals
    ctx.prisma.booking.findUnique
      .mockResolvedValueOnce(acceptedBooking)   // getBookingOrThrow
      .mockResolvedValueOnce({                  // generateCareTasks re-fetch
        ...activeBooking,
        pets: [{ pet: { id: 'pet-1', schedules: [] } }],
      });

    // bookingEndCode.create for the 4-digit code
    ctx.prisma.bookingEndCode.create.mockResolvedValue({
      bookingId,
      code: '1234',
      isUsed: false,
    });

    const startResult = await bookingsService.startService(sitter.id, bookingId);

    expect(startResult.status).toBe('active');
    expect(ctx.eventSpy.hasEvent('booking.started')).toBe(true);
    expect(ctx.eventSpy.hasEvent('booking.in_progress')).toBe(true);

    // ── Phase 4: endService ─────────────────────────────────────────────

    ctx.prisma.booking.findUnique.mockResolvedValue(activeBooking);

    const completedBooking = { ...activeBooking, status: 'completed', actualEnd: new Date() };
    ctx.prisma.booking.update.mockResolvedValue(completedBooking);

    const endResult = await bookingsService.endService(sitter.id, bookingId);

    expect(endResult.status).toBe('completed');
    expect(ctx.eventSpy.hasEvent('booking.ended')).toBe(true);
    expect(ctx.eventSpy.hasEvent('booking.completed')).toBe(true);

    // ── Verify full event chain ─────────────────────────────────────────

    const eventNames = ctx.eventSpy.captured.map((e) => e.event);
    expect(eventNames).toContain('booking.created');
    expect(eventNames).toContain('booking.accepted');
    expect(eventNames).toContain('booking.started');
    expect(eventNames).toContain('booking.completed');
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: Parent cancels before acceptance — triggers cancellation event
  // ────────────────────────────────────────────────────────────────────────

  it('should cancel a pending booking and emit cancellation event', async () => {
    const bookingId = 'booking-cancel-1';
    const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000); // +48h

    const pendingBooking = createBooking({
      id: bookingId,
      parentId: owner.id,
      petFriendId: sitter.id,
      status: 'pending',
      requestedStart: futureStart,
      requestedEnd: new Date(futureStart.getTime() + 2 * 60 * 60 * 1000),
    });

    ctx.prisma.booking.findUnique.mockResolvedValue(pendingBooking);
    ctx.prisma.booking.update.mockResolvedValue({
      ...pendingBooking,
      status: 'cancelled',
      cancelledById: owner.id,
      cancellationReason: 'Changed my plans',
    });

    const result = await bookingsService.cancelBooking(
      owner.id,
      bookingId,
      'Changed my plans',
    );

    expect(result.message).toBe('Booking cancelled.');
    expect(ctx.eventSpy.hasEvent('booking.cancelled')).toBe(true);

    const cancelEvent = ctx.eventSpy.getByEvent('booking.cancelled')[0];
    expect((cancelEvent.payload as any).cancelledBy).toBe('owner');
    expect((cancelEvent.payload as any).cancellationType).toBe('owner_24h_plus');

    // Verify soft lock was released (pending booking)
    expect(ctx.redis.del).toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Double review rejected with ConflictException
  // ────────────────────────────────────────────────────────────────────────

  it('should reject a second review on the same booking with ConflictException', async () => {
    const bookingId = 'booking-review-1';

    const completedBooking = createCompletedBooking({
      id: bookingId,
      parentId: owner.id,
      petFriendId: sitter.id,
      serviceType: 'dog_walking',
      status: 'completed',
    });

    // ── First review: success ───────────────────────────────────────────

    ctx.prisma.booking.findUnique.mockResolvedValue(completedBooking);
    ctx.prisma.review.findUnique.mockResolvedValue(null); // no existing review
    ctx.prisma.review.create.mockResolvedValue(
      createReview({
        bookingId,
        reviewerId: owner.id,
        providerUserId: sitter.id,
        rating: 5,
      }),
    );
    ctx.prisma.booking.update.mockResolvedValue({
      ...completedBooking,
      parentReviewed: true,
    });
    // Mock for ReputationService.computeSnapshot + updateLegacyPetFriendRating
    ctx.prisma.review.findMany.mockResolvedValue([
      { rating: 5, overallRating: 5, tags: ['great_with_pets'], replyStatus: 'NO_REPLY' },
    ]);
    (ctx.prisma.petFriendProfile as any).updateMany = jest.fn().mockResolvedValue({ count: 1 });

    const firstReview = await reviewsService.createReview(owner.id, {
      bookingId,
      rating: 5,
      comment: 'Excellent care for Buddy!',
    } as any);

    expect(firstReview.rating).toBe(5);
    expect(ctx.eventSpy.hasEvent('review.posted')).toBe(true);

    // ── Second review: ConflictException ────────────────────────────────

    ctx.prisma.booking.findUnique.mockResolvedValue(completedBooking);
    ctx.prisma.review.findUnique.mockResolvedValue(
      createReview({ bookingId }),
    ); // existing review found

    await expect(
      reviewsService.createReview(owner.id, {
        bookingId,
        rating: 4,
        comment: 'Trying again',
      } as any),
    ).rejects.toThrow(ConflictException);
  });
});
