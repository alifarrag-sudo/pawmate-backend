import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { ReputationService } from './reputation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('Reviews Module', () => {
  let reviewsService: ReviewsService;
  let reputationService: ReputationService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  beforeEach(async () => {
    prisma = {
      review: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      reputationSnapshot: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      booking: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      petFriendProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trainerProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        ReputationService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    reviewsService = module.get<ReviewsService>(ReviewsService);
    reputationService = module.get<ReputationService>(ReputationService);
  });

  // ── Review creation ────────────────────────────────────────────────────────

  describe('createReview', () => {
    it('should create a visible review and trigger reputation recompute', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        parentId: mockUserId,
        status: 'completed',
        petFriendId: 'provider-1',
        serviceType: 'dog_walking',
      });
      prisma.review.findUnique.mockResolvedValue(null); // no existing review
      prisma.review.create.mockResolvedValue({
        id: 'review-1',
        bookingId: 'booking-1',
        rating: 5,
        isVisible: true,
        providerType: 'PETFRIEND',
      });

      // Mock reputation compute
      prisma.review.findMany.mockResolvedValue([]);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});

      const result = await reviewsService.createReview(mockUserId, {
        bookingId: 'booking-1',
        rating: 5,
        tags: ['punctual', 'great_with_pets'],
        comment: 'Excellent service!',
      });

      expect(result.isVisible).toBe(true);
      expect(events.emit).toHaveBeenCalledWith('review.posted', expect.any(Object));
    });

    it('should reject duplicate review for same booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        parentId: mockUserId,
        status: 'completed',
      });
      prisma.review.findUnique.mockResolvedValue({ id: 'existing-review' }); // already exists

      await expect(
        reviewsService.createReview(mockUserId, {
          bookingId: 'booking-1',
          rating: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject review when booking not found', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        reviewsService.createReview(mockUserId, {
          bookingId: 'nonexistent',
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject review for non-completed booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        parentId: mockUserId,
        status: 'active', // not completed
      });

      await expect(
        reviewsService.createReview(mockUserId, {
          bookingId: 'booking-1',
          rating: 4,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Flag auto-hides review ─────────────────────────────────────────────────

  describe('flagReview', () => {
    it('should auto-hide review when flagged', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        isVisible: true,
        isFlagged: false,
      });
      prisma.review.update.mockResolvedValue({
        id: 'review-1',
        isVisible: false,
        isFlagged: true,
      });

      const result = await reviewsService.flagReview('flagger-user', 'review-1', {
        reason: 'inappropriate',
      });

      expect(result.isVisible).toBe(false);
      expect(result.isFlagged).toBe(true);
      expect(events.emit).toHaveBeenCalledWith('review.flagged', expect.any(Object));
    });
  });

  // ── Admin moderation ───────────────────────────────────────────────────────

  describe('moderateReview', () => {
    it('should restore visibility when admin approves flagged review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        isVisible: false,
        isFlagged: true,
      });
      prisma.review.update.mockResolvedValue({
        id: 'review-1',
        isVisible: true,
        isFlagged: true,
        moderationAction: 'APPROVED',
      });

      const result = await reviewsService.moderateReview('review-1', 'admin-1', {
        action: 'approved',
      });

      expect(result.isVisible).toBe(true);
      expect(result.moderationAction).toBe('APPROVED');
    });
  });

  // ── Provider reply flow ────────────────────────────────────────────────────

  describe('provider reply', () => {
    it('should set reply to DRAFT_SUBMITTED state', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'NO_REPLY',
        providerUserId: 'provider-1',
      });
      prisma.review.update.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'DRAFT_SUBMITTED',
        replyDraftText: 'Thank you for the feedback!',
      });

      const result = await reviewsService.submitReply('review-1', 'provider-1', {
        replyText: 'Thank you for the feedback!',
      });

      expect(result.replyStatus).toBe('DRAFT_SUBMITTED');
      expect(events.emit).toHaveBeenCalledWith('review.reply_submitted', expect.any(Object));
    });

    it('should set reply to APPROVED when admin approves', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'DRAFT_SUBMITTED',
        replyDraftText: 'Thank you!',
      });
      prisma.review.update.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'APPROVED',
        replyText: 'Thank you!',
      });

      const result = await reviewsService.approveReply('admin-1', 'review-1');

      expect(result.replyStatus).toBe('APPROVED');
      expect(result.replyText).toBe('Thank you!');
    });

    it('should set reply to REJECTED with reason', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'DRAFT_SUBMITTED',
        replyDraftText: 'You are wrong!',
      });
      prisma.review.update.mockResolvedValue({
        id: 'review-1',
        replyStatus: 'REJECTED',
        replyRejectionReason: 'Unprofessional tone',
      });

      const result = await reviewsService.rejectReply('review-1', 'admin-1', {
        action: 'reject',
        reason: 'Unprofessional tone',
      });

      expect(result.replyStatus).toBe('REJECTED');
    });
  });

  // ── Reputation snapshot computation ────────────────────────────────────────

  describe('ReputationService', () => {
    it('should compute correct averageRating and fiveStarCount', async () => {
      prisma.review.findMany.mockResolvedValue([
        { rating: 5, tags: ['punctual'], replyStatus: 'APPROVED' },
        { rating: 5, tags: ['punctual', 'caring'], replyStatus: 'NO_REPLY' },
        { rating: 4, tags: ['communicative'], replyStatus: 'NO_REPLY' },
        { rating: 3, tags: [], replyStatus: 'NO_REPLY' },
        { rating: 1, tags: [], replyStatus: 'NO_REPLY' },
      ]);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});
      prisma.petFriendProfile.findUnique.mockResolvedValue(null);

      await reputationService.computeSnapshot('PETFRIEND', 'profile-1');

      const upsertCall = prisma.reputationSnapshot.upsert.mock.calls[0][0];
      expect(upsertCall.create.averageRating).toBe(3.6); // (5+5+4+3+1)/5 = 3.6
      expect(upsertCall.create.fiveStarCount).toBe(2);
      expect(upsertCall.create.totalReviews).toBe(5);
      expect(upsertCall.create.ratingDistribution['5']).toBe(2);
      expect(upsertCall.create.ratingDistribution['1']).toBe(1);
    });
  });

  // ── Commission tier upgrade ────────────────────────────────────────────────

  describe('commission tier upgrade', () => {
    it('should upgrade to 0.10 when avgRating>=4.5 AND totalReviews>=20', async () => {
      const reviews = Array.from({ length: 22 }, () => ({
        rating: 5,
        tags: ['great_with_pets'],
        replyStatus: 'NO_REPLY',
      }));
      prisma.review.findMany.mockResolvedValue(reviews);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        commissionRate: 0.15,
      });
      prisma.petFriendProfile.update.mockResolvedValue({});

      await reputationService.computeSnapshot('PETFRIEND', 'profile-1');

      expect(prisma.petFriendProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: { commissionRate: 0.10 },
      });
      expect(events.emit).toHaveBeenCalledWith('provider.tier_upgraded', expect.objectContaining({
        providerType: 'PETFRIEND',
        newRate: 0.10,
      }));
    });

    it('should NOT upgrade when avgRating>=4.5 but totalReviews<20', async () => {
      const reviews = Array.from({ length: 15 }, () => ({
        rating: 5,
        tags: [],
        replyStatus: 'NO_REPLY',
      }));
      prisma.review.findMany.mockResolvedValue(reviews);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        commissionRate: 0.15,
      });

      await reputationService.computeSnapshot('PETFRIEND', 'profile-1');

      // commissionRate should stay 0.15 — not enough reviews
      expect(prisma.petFriendProfile.update).not.toHaveBeenCalled();
    });
  });

  // ── Visibility filtering ───────────────────────────────────────────────────

  describe('getReviews', () => {
    it('should only return visible reviews in public endpoint', async () => {
      prisma.review.findMany.mockResolvedValue([
        { id: 'r1', isVisible: true, rating: 5 },
        // r2 is hidden, shouldn't appear
      ]);
      prisma.review.count.mockResolvedValue(1);

      const result = await reviewsService.getReviews({
        providerType: 'PETFRIEND',
        providerProfileId: 'profile-1',
      });

      // Verify the where clause includes isVisible: true
      const findCall = prisma.review.findMany.mock.calls[0][0];
      expect(findCall.where.isVisible).toBe(true);
    });
  });
});
