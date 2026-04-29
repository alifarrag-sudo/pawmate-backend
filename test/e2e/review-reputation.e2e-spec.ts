/**
 * Suite 5 — Review and Reputation (Service-level with mocked Prisma)
 *
 * Verifies that:
 *  - Full review lifecycle: post -> flag -> moderate -> reply flow
 *  - Reputation snapshot computation is accurate
 *  - Flagged/invisible reviews are excluded from public results
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';

import { ReviewsService } from '../../src/modules/reviews/reviews.service';
import { ReputationService } from '../../src/modules/reviews/reputation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createMockPrisma,
  createEventSpy,
} from '../helpers/test-app.helper';
import { createReview } from '../factories/review.factory';
import { createCompletedBooking } from '../factories/booking.factory';

// ── Constants ────────────────────────────────────────────────────────────────

const REVIEWER_ID = randomUUID();
const PROVIDER_USER_ID = randomUUID();
const ADMIN_ID = randomUUID();
const BOOKING_ID = randomUUID();

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('Suite 5 — Review and Reputation', () => {
  let reviewsService: ReviewsService;
  let reputationService: ReputationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: EventEmitter2;
  let eventSpy: ReturnType<typeof createEventSpy>;

  beforeAll(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        ReviewsService,
        ReputationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    reviewsService = module.get(ReviewsService);
    reputationService = module.get(ReputationService);
    events = module.get(EventEmitter2);
    eventSpy = createEventSpy(events);

    // Add updateMany mock — not in the shared helper but needed by ReviewsService
    (prisma.petFriendProfile as any).updateMany = jest.fn().mockResolvedValue({ count: 1 });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventSpy.clear();
  });

  // ── Test 1: Full review lifecycle ─────────────────────────────────────────

  describe('Full review lifecycle: post -> flag -> moderate -> reply', () => {
    const reviewId = randomUUID();

    it('creates a review and verifies it is visible', async () => {
      const booking = createCompletedBooking({
        id: BOOKING_ID,
        parentId: REVIEWER_ID,
        petFriendId: PROVIDER_USER_ID,
        serviceType: 'dog_walking',
      });

      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.review.findUnique.mockResolvedValue(null); // No duplicate

      const createdReview = createReview({
        id: reviewId,
        bookingId: BOOKING_ID,
        reviewerId: REVIEWER_ID,
        providerUserId: PROVIDER_USER_ID,
        providerType: 'PETFRIEND',
        rating: 4,
        overallRating: 4,
        comment: 'Good walker, a bit late',
        isVisible: true,
        isPublished: true,
      });

      prisma.review.create.mockResolvedValue(createdReview);
      prisma.booking.update.mockResolvedValue({ ...booking, parentReviewed: true });

      // Mock the reputation snapshot upsert
      prisma.reputationSnapshot.upsert.mockResolvedValue({});
      // Mock the review lookup for reputation computation
      prisma.review.findMany.mockResolvedValue([createdReview]);
      // Mock legacy PetFriend rating update
      prisma.petFriendProfile.findUnique.mockResolvedValue({ id: 'pf-1', userId: PROVIDER_USER_ID });
      prisma.petFriendProfile.update.mockResolvedValue({});

      const result = await reviewsService.createReview(REVIEWER_ID, {
        bookingId: BOOKING_ID,
        rating: 4,
        comment: 'Good walker, a bit late',
      } as any);

      expect(result.isVisible).toBe(true);
      expect(result.isPublished).toBe(true);
      expect(result.rating).toBe(4);
      expect(prisma.review.create).toHaveBeenCalledTimes(1);

      // Verify the event was emitted
      expect(eventSpy.hasEvent('review.posted')).toBe(true);
    });

    it('flags a review and verifies it is hidden', async () => {
      const existingReview = createReview({
        id: reviewId,
        providerUserId: PROVIDER_USER_ID,
        providerType: 'PETFRIEND',
        isVisible: true,
        isFlagged: false,
      });

      prisma.review.findUnique.mockResolvedValue(existingReview);

      const flaggedReview = {
        ...existingReview,
        isFlagged: true,
        isVisible: false,
        flaggedAt: new Date(),
        flaggedReason: 'inappropriate_content',
        flaggedByUserId: ADMIN_ID,
      };

      prisma.review.update.mockResolvedValue(flaggedReview);
      // Mock for reputation recomputation
      prisma.review.findMany.mockResolvedValue([]);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});

      const result = await reviewsService.flagReview(
        reviewId,
        ADMIN_ID,
        { reason: 'inappropriate_content' },
      );

      expect(result.isFlagged).toBe(true);
      expect(result.isVisible).toBe(false);
      expect(eventSpy.hasEvent('review.flagged')).toBe(true);
    });

    it('moderates (approves) a flagged review and restores visibility', async () => {
      const flaggedReview = createReview({
        id: reviewId,
        providerUserId: PROVIDER_USER_ID,
        providerType: 'PETFRIEND',
        isFlagged: true,
        isVisible: false,
      });

      prisma.review.findUnique.mockResolvedValue(flaggedReview);

      const moderatedReview = {
        ...flaggedReview,
        isModerated: true,
        moderationAction: 'approved',
        isVisible: true,
        isFlagged: false,
        moderatedAt: new Date(),
        moderatedBy: ADMIN_ID,
      };

      prisma.review.update.mockResolvedValue(moderatedReview);
      prisma.review.findMany.mockResolvedValue([moderatedReview]);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});

      const result = await reviewsService.moderateReview(
        reviewId,
        ADMIN_ID,
        { action: 'approved' },
      );

      expect(result.isVisible).toBe(true);
      expect(result.isFlagged).toBe(false);
      expect(result.isModerated).toBe(true);
      expect(eventSpy.hasEvent('review.moderated')).toBe(true);
    });

    it('submits a reply draft and verifies replyStatus=DRAFT_SUBMITTED', async () => {
      const approvedReview = createReview({
        id: reviewId,
        providerUserId: PROVIDER_USER_ID,
        providerType: 'PETFRIEND',
        isVisible: true,
        replyStatus: 'NO_REPLY',
      });

      prisma.review.findUnique.mockResolvedValue(approvedReview);

      // Mock: no recent rejections, insufficient approved replies for auto-approve
      prisma.review.count
        .mockResolvedValueOnce(0)  // recentRejections
        .mockResolvedValueOnce(2); // approvedReplies (< 5, so no auto-approve)

      const updatedReview = {
        ...approvedReview,
        replyDraftText: 'Thank you for your feedback! We will work on punctuality.',
        replyStatus: 'DRAFT_SUBMITTED',
        replySubmittedAt: new Date(),
      };

      prisma.review.update.mockResolvedValue(updatedReview);

      const result = await reviewsService.submitReply(
        reviewId,
        PROVIDER_USER_ID,
        { replyText: 'Thank you for your feedback! We will work on punctuality.' },
      );

      expect(result.replyStatus).toBe('DRAFT_SUBMITTED');
      expect(eventSpy.hasEvent('review.reply_submitted')).toBe(true);
    });

    it('approves a reply and verifies replyStatus=APPROVED', async () => {
      const draftReview = createReview({
        id: reviewId,
        providerUserId: PROVIDER_USER_ID,
        providerType: 'PETFRIEND',
        replyStatus: 'DRAFT_SUBMITTED',
        replyDraftText: 'Thank you for your feedback!',
      });

      // First call is from approveReply -> approveReplyInternal findUnique
      prisma.review.findUnique.mockResolvedValue(draftReview);

      const approvedReply = {
        ...draftReview,
        replyText: draftReview.replyDraftText,
        replyStatus: 'APPROVED',
        replyApprovedAt: new Date(),
        replyApprovedBy: ADMIN_ID,
      };

      prisma.review.update.mockResolvedValue(approvedReply);
      prisma.review.findMany.mockResolvedValue([approvedReply]);
      prisma.reputationSnapshot.upsert.mockResolvedValue({});

      const result = await reviewsService.approveReply(reviewId, ADMIN_ID);

      expect(result.replyStatus).toBe('APPROVED');
      expect(result.replyText).toBe('Thank you for your feedback!');
      expect(eventSpy.hasEvent('review.reply_approved')).toBe(true);
    });
  });

  // ── Test 2: Reputation snapshot accuracy ──────────────────────────────────

  describe('Reputation snapshot accuracy', () => {
    it('computes snapshot correctly for ratings [5,5,4,3,1]', async () => {
      const providerType = 'PETFRIEND';
      const providerProfileId = randomUUID();

      const mockReviews = [
        { rating: 5, tags: ['punctual', 'great_with_pets'], replyStatus: 'APPROVED' },
        { rating: 5, tags: ['punctual', 'caring'], replyStatus: 'APPROVED' },
        { rating: 4, tags: ['communicative'], replyStatus: 'NO_REPLY' },
        { rating: 3, tags: ['punctual'], replyStatus: 'NO_REPLY' },
        { rating: 1, tags: [], replyStatus: 'NO_REPLY' },
      ];

      prisma.review.findMany.mockResolvedValue(mockReviews);
      prisma.reputationSnapshot.upsert.mockImplementation(async (args: any) => {
        return { ...args.create, ...args.update };
      });

      // Mock for commission tier check — profile not found (skip tier change)
      prisma.petFriendProfile.findUnique.mockResolvedValue(null);

      await reputationService.computeSnapshot(providerType, providerProfileId);

      expect(prisma.reputationSnapshot.upsert).toHaveBeenCalledTimes(1);

      const upsertCall = prisma.reputationSnapshot.upsert.mock.calls[0][0];

      // Verify averageRating = (5+5+4+3+1)/5 = 3.6
      expect(upsertCall.create.averageRating).toBe(3.6);
      expect(upsertCall.update.averageRating).toBe(3.6);

      // Verify fiveStarCount = 2
      expect(upsertCall.create.fiveStarCount).toBe(2);
      expect(upsertCall.update.fiveStarCount).toBe(2);

      // Verify totalReviews = 5
      expect(upsertCall.create.totalReviews).toBe(5);
      expect(upsertCall.update.totalReviews).toBe(5);

      // Verify rating distribution
      const distribution = upsertCall.create.ratingDistribution;
      expect(distribution['5']).toBe(2);
      expect(distribution['4']).toBe(1);
      expect(distribution['3']).toBe(1);
      expect(distribution['2']).toBe(0);
      expect(distribution['1']).toBe(1);

      // Verify response rate: 2 approved out of 5 = 40%
      expect(upsertCall.create.responseRate).toBe(40);

      // Verify top tags: punctual appears 3 times, should be first
      expect(upsertCall.create.topTags[0]).toBe('punctual');

      // Recent rating equals average rating when <= 30 reviews
      expect(upsertCall.create.recentRating).toBe(3.6);
    });
  });

  // ── Test 3: Flagged review not in public results ──────────────────────────

  describe('Flagged review not in public results', () => {
    it('excludes flagged/invisible reviews from getReviews', async () => {
      const visibleReview = createReview({
        id: randomUUID(),
        isVisible: true,
        isPublished: true,
        isFlagged: false,
        rating: 5,
      });

      // getReviews queries with { isVisible: true, isPublished: true }
      // so Prisma should only return visible reviews.
      // We mock Prisma to return only the visible review (the flagged one
      // wouldn't match the where clause).
      prisma.review.findMany.mockResolvedValue([visibleReview]);
      prisma.review.count.mockResolvedValue(1);

      const result = await reviewsService.getReviews({
        providerUserId: PROVIDER_USER_ID,
        page: 1,
        limit: 20,
      });

      expect(result.reviews).toHaveLength(1);
      expect(result.total).toBe(1);

      // Verify the where clause filters for isVisible=true and isPublished=true
      const findManyCall = prisma.review.findMany.mock.calls[0][0];
      expect(findManyCall.where.isVisible).toBe(true);
      expect(findManyCall.where.isPublished).toBe(true);

      // No flagged reviews should be in the result set
      const flaggedInResults = result.reviews.filter(
        (r: any) => r.isFlagged === true && r.isVisible === false,
      );
      expect(flaggedInResults).toHaveLength(0);
    });

    it('verifies getReviews where clause always enforces visibility', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      // Call with various filter combinations
      await reviewsService.getReviews({ page: 1 });
      await reviewsService.getReviews({ providerType: 'KENNEL', page: 1 });
      await reviewsService.getReviews({ rating: 5, page: 1 });

      // All three calls must have isVisible: true, isPublished: true
      for (const call of prisma.review.findMany.mock.calls) {
        expect(call[0].where.isVisible).toBe(true);
        expect(call[0].where.isPublished).toBe(true);
      }
    });
  });
});
