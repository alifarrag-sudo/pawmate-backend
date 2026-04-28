import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationService } from './reputation.service';
import { REVIEW_TAGS } from './review-tags';
import {
  CreateReviewDto,
  FlagReviewDto,
  SubmitReplyDto,
  ModerateReviewDto,
  ModerateReplyDto,
} from './reviews.dto';
import { ProviderType, ServiceType } from '@prisma/client';

interface ProviderIdentity {
  providerType: ProviderType;
  providerUserId: string | null;
  kennelProfileId: string | null;
  petHotelProfileId: string | null;
  shopProfileId: string | null;
  vetProfileId: string | null;
  groomerProfileId: string | null;
  profileIdForReputation: string;
}

const SERVICE_TO_PROVIDER: Record<string, ProviderType> = {
  dog_walking: ProviderType.PETFRIEND,
  pet_watching_hourly: ProviderType.PETFRIEND,
  pet_watching_daily: ProviderType.PETFRIEND,
  overnight_stay: ProviderType.PETFRIEND,
  trainer_session: ProviderType.TRAINER,
  kennel_boarding: ProviderType.KENNEL,
  pethotel_boarding: ProviderType.PETHOTEL,
};

const AUTO_APPROVE_THRESHOLD_DAYS = 30;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly reputationService: ReputationService,
  ) {}

  // ────────────────────────────────────────────
  // CREATE
  // ────────────────────────────────────────────

  async createReview(reviewerId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.parentId !== reviewerId) {
      throw new ForbiddenException('You can only review your own bookings');
    }

    if (booking.status !== 'completed') {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Prevent duplicate
    const existing = await this.prisma.review.findUnique({
      where: { bookingId: dto.bookingId },
    });
    if (existing) {
      throw new ConflictException('Review already submitted for this booking');
    }

    // Resolve provider identity from booking
    const identity = this.resolveProviderIdentity(booking);

    // Validate tags against provider type
    if (dto.tags && dto.tags.length > 0) {
      const validTags = this.getValidTagsForType(identity.providerType);
      const invalidTags = dto.tags.filter(t => !validTags.includes(t));
      if (invalidTags.length > 0) {
        throw new BadRequestException(`Invalid tags for ${identity.providerType}: ${invalidTags.join(', ')}`);
      }
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        reviewerId,
        // Legacy compat
        revieweeId: identity.providerUserId,
        revieweeType: identity.providerType === ProviderType.PETFRIEND ? 'petfriend' : 'petfriend',
        // Polymorphic provider refs
        providerUserId: identity.providerUserId,
        kennelProfileId: identity.kennelProfileId,
        petHotelProfileId: identity.petHotelProfileId,
        shopProfileId: identity.shopProfileId,
        vetProfileId: identity.vetProfileId,
        groomerProfileId: identity.groomerProfileId,
        providerType: identity.providerType,
        // Ratings
        rating: dto.rating,
        overallRating: dto.rating,
        ratingCommunication: dto.ratingCommunication ? parseFloat(dto.ratingCommunication) : null,
        ratingReliability: dto.ratingReliability ? parseFloat(dto.ratingReliability) : null,
        ratingCareQuality: dto.ratingCareQuality ? parseFloat(dto.ratingCareQuality) : null,
        ratingValue: dto.ratingValue ? parseFloat(dto.ratingValue) : null,
        // Content
        tags: dto.tags ?? [],
        comment: dto.comment ?? null,
        wouldRebook: dto.wouldRebook ?? null,
        photos: dto.photos ?? [],
        // Published immediately
        isPublished: true,
        isVisible: true,
        publishedAt: new Date(),
      },
    });

    // Mark booking as reviewed
    await this.prisma.booking.update({
      where: { id: dto.bookingId },
      data: { parentReviewed: true },
    });

    // Recompute reputation snapshot
    await this.reputationService.computeSnapshot(
      identity.providerType,
      identity.profileIdForReputation,
    );

    // Also update legacy avgRating on PetFriendProfile if applicable
    if (identity.providerType === ProviderType.PETFRIEND && identity.providerUserId) {
      await this.updateLegacyPetFriendRating(identity.providerUserId);
    }

    this.events.emit('review.posted', {
      reviewId: review.id,
      bookingId: dto.bookingId,
      rating: dto.rating,
      reviewerId,
      providerType: identity.providerType,
      profileId: identity.profileIdForReputation,
    });

    this.logger.log(`Review ${review.id} created for booking ${dto.bookingId}`);

    return review;
  }

  // ────────────────────────────────────────────
  // READ / LIST
  // ────────────────────────────────────────────

  async getReviews(filters: {
    providerType?: string;
    providerProfileId?: string;
    providerUserId?: string;
    rating?: number;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { isVisible: true, isPublished: true };

    if (filters.providerType) {
      where.providerType = filters.providerType;
    }
    if (filters.providerUserId) {
      where.providerUserId = filters.providerUserId;
    }
    if (filters.providerProfileId) {
      where.OR = [
        { providerUserId: filters.providerProfileId },
        { kennelProfileId: filters.providerProfileId },
        { petHotelProfileId: filters.providerProfileId },
        { shopProfileId: filters.providerProfileId },
        { vetProfileId: filters.providerProfileId },
        { groomerProfileId: filters.providerProfileId },
      ];
    }
    if (filters.rating) {
      where.rating = filters.rating;
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true, profilePhoto: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { reviews, total, page, limit };
  }

  async getReviewById(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async getReviewByBookingId(bookingId: string) {
    const review = await this.prisma.review.findUnique({
      where: { bookingId },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('No review found for this booking');
    }

    return review;
  }

  async getReputationSnapshot(providerType: string, providerProfileId: string) {
    const snapshot = await this.prisma.reputationSnapshot.findUnique({
      where: {
        providerType_providerProfileId: {
          providerType: providerType as any,
          providerProfileId,
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Reputation snapshot not found');
    }

    return snapshot;
  }

  // Legacy endpoint compat
  async getReviewsForSitter(petFriendId: string) {
    return this.prisma.review.findMany({
      where: {
        OR: [
          { revieweeId: petFriendId },
          { providerUserId: petFriendId },
        ],
        isVisible: true,
        isPublished: true,
      },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  // Legacy endpoint compat
  async getMyReviews(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        OR: [
          { revieweeId: userId },
          { providerUserId: userId },
        ],
        isVisible: true,
        isPublished: true,
      },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, profilePhoto: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return reviews.map(r => ({
      ...r,
      rating: r.rating ?? Number(r.overallRating),
      createdAt: r.submittedAt,
    }));
  }

  // ────────────────────────────────────────────
  // FLAG
  // ────────────────────────────────────────────

  async flagReview(reviewId: string, userId: string, dto: FlagReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Auto-hide immediately on flag
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        isFlagged: true,
        isVisible: false,
        flaggedAt: new Date(),
        flaggedReason: dto.reason,
        flaggedByUserId: userId,
      },
    });

    this.events.emit('review.flagged', {
      reviewId,
      flaggedBy: userId,
      reason: dto.reason,
    });

    this.logger.log(`Review ${reviewId} flagged by ${userId} — auto-hidden`);

    // Recompute reputation (review now invisible)
    if (review.providerType && this.getProfileIdFromReview(review)) {
      await this.reputationService.computeSnapshot(
        review.providerType,
        this.getProfileIdFromReview(review),
      );
    }

    return updated;
  }

  // ────────────────────────────────────────────
  // REPLY (Provider → Draft → Noura Approves → Live)
  // ────────────────────────────────────────────

  async submitReply(reviewId: string, providerUserId: string, dto: SubmitReplyDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Verify the caller is the provider being reviewed
    const isOwner = this.isReviewOwner(review, providerUserId);
    if (!isOwner) {
      throw new ForbiddenException('Only the reviewed provider can reply');
    }

    if (review.replyStatus === 'APPROVED') {
      throw new ConflictException('Reply already approved and published');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        replyDraftText: dto.replyText,
        replyStatus: 'DRAFT_SUBMITTED',
        replySubmittedAt: new Date(),
      },
    });

    this.events.emit('review.reply_submitted', {
      reviewId,
      providerUserId,
      draftText: dto.replyText,
    });

    this.logger.log(`Reply draft submitted for review ${reviewId}`);

    // Check auto-approve eligibility
    const shouldAutoApprove = await this.checkAutoApproveEligibility(review);
    if (shouldAutoApprove) {
      return this.approveReplyInternal(reviewId, 'system_auto_approve');
    }

    return updated;
  }

  async approveReply(reviewId: string, adminUserId: string) {
    return this.approveReplyInternal(reviewId, adminUserId);
  }

  async rejectReply(reviewId: string, adminUserId: string, dto: ModerateReplyDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.replyStatus !== 'DRAFT_SUBMITTED') {
      throw new BadRequestException('No pending reply draft to reject');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        replyStatus: 'REJECTED',
        replyRejectedAt: new Date(),
        replyRejectionReason: dto.reason ?? 'Rejected by moderator',
      },
    });

    this.events.emit('review.reply_rejected', {
      reviewId,
      rejectedBy: adminUserId,
      reason: dto.reason,
    });

    this.logger.log(`Reply rejected for review ${reviewId} by ${adminUserId}`);

    return updated;
  }

  // ────────────────────────────────────────────
  // HELPFUL
  // ────────────────────────────────────────────

  async markHelpful(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });
  }

  // ────────────────────────────────────────────
  // MODERATION (Admin)
  // ────────────────────────────────────────────

  async moderateReview(reviewId: string, adminUserId: string, dto: ModerateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const data: any = {
      isModerated: true,
      moderationAction: dto.action,
      moderationNote: dto.moderationNote ?? null,
      moderatedAt: new Date(),
      moderatedBy: adminUserId,
    };

    if (dto.action === 'removed') {
      data.isVisible = false;
      data.isPublished = false;
    } else if (dto.action === 'edited' && dto.editedText) {
      data.comment = dto.editedText;
    } else if (dto.action === 'approved') {
      data.isVisible = true;
      data.isFlagged = false;
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data,
    });

    this.events.emit('review.moderated', {
      reviewId,
      action: dto.action,
      moderatedBy: adminUserId,
    });

    this.logger.log(`Review ${reviewId} moderated: action=${dto.action} by ${adminUserId}`);

    // Recompute reputation
    if (review.providerType && this.getProfileIdFromReview(review)) {
      await this.reputationService.computeSnapshot(
        review.providerType,
        this.getProfileIdFromReview(review),
      );
    }

    return updated;
  }

  // ────────────────────────────────────────────
  // INTERNAL HELPERS
  // ────────────────────────────────────────────

  private resolveProviderIdentity(booking: any): ProviderIdentity {
    const providerType = SERVICE_TO_PROVIDER[booking.serviceType];
    if (!providerType) {
      throw new BadRequestException(`Cannot determine provider type from service type: ${booking.serviceType}`);
    }

    const identity: ProviderIdentity = {
      providerType,
      providerUserId: null,
      kennelProfileId: null,
      petHotelProfileId: null,
      shopProfileId: null,
      vetProfileId: null,
      groomerProfileId: null,
      profileIdForReputation: '',
    };

    switch (providerType) {
      case ProviderType.PETFRIEND:
        identity.providerUserId = booking.petFriendId;
        identity.profileIdForReputation = booking.petFriendId;
        break;
      case ProviderType.TRAINER:
        identity.providerUserId = booking.trainerId ?? booking.petFriendId;
        identity.profileIdForReputation = booking.trainerProfileId ?? booking.trainerId ?? booking.petFriendId;
        break;
      case ProviderType.KENNEL:
        identity.kennelProfileId = booking.kennelId;
        identity.profileIdForReputation = booking.kennelId;
        break;
      case ProviderType.PETHOTEL:
        identity.petHotelProfileId = booking.petHotelId;
        identity.profileIdForReputation = booking.petHotelId;
        break;
      default:
        identity.providerUserId = booking.petFriendId;
        identity.profileIdForReputation = booking.petFriendId;
    }

    if (!identity.profileIdForReputation) {
      throw new BadRequestException('Cannot determine provider profile for this booking');
    }

    return identity;
  }

  private getValidTagsForType(providerType: ProviderType): string[] {
    const typeKey = providerType === ProviderType.PETHOTEL ? 'PET_HOTEL' : providerType;
    return REVIEW_TAGS[typeKey] ?? [];
  }

  private getProfileIdFromReview(review: any): string {
    return (
      review.providerUserId ??
      review.kennelProfileId ??
      review.petHotelProfileId ??
      review.shopProfileId ??
      review.vetProfileId ??
      review.groomerProfileId ??
      ''
    );
  }

  private isReviewOwner(review: any, userId: string): boolean {
    return (
      review.providerUserId === userId ||
      review.revieweeId === userId
    );
  }

  private async approveReplyInternal(reviewId: string, approvedBy: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.replyStatus !== 'DRAFT_SUBMITTED') {
      throw new BadRequestException('No pending reply draft to approve');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        replyText: review.replyDraftText,
        replyStatus: 'APPROVED',
        replyApprovedAt: new Date(),
        replyApprovedBy: approvedBy,
      },
    });

    this.events.emit('review.reply_approved', {
      reviewId,
      approvedBy,
    });

    this.logger.log(`Reply approved for review ${reviewId} by ${approvedBy}`);

    // Recompute reputation (response rate changed)
    if (review.providerType && this.getProfileIdFromReview(review)) {
      await this.reputationService.computeSnapshot(
        review.providerType,
        this.getProfileIdFromReview(review),
      );
    }

    return updated;
  }

  private async checkAutoApproveEligibility(review: any): Promise<boolean> {
    const profileId = this.getProfileIdFromReview(review);
    if (!profileId || !review.providerType) return false;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - AUTO_APPROVE_THRESHOLD_DAYS);

    // Check if provider has had any rejected replies in the last 30 days
    const recentRejections = await this.prisma.review.count({
      where: {
        OR: [
          { providerUserId: profileId },
          { kennelProfileId: profileId },
          { petHotelProfileId: profileId },
          { shopProfileId: profileId },
          { vetProfileId: profileId },
          { groomerProfileId: profileId },
        ],
        replyStatus: 'REJECTED',
        replyRejectedAt: { gte: thirtyDaysAgo },
      },
    });

    if (recentRejections > 0) return false;

    // Check if provider has at least some approved replies (track record)
    const approvedReplies = await this.prisma.review.count({
      where: {
        OR: [
          { providerUserId: profileId },
          { kennelProfileId: profileId },
          { petHotelProfileId: profileId },
          { shopProfileId: profileId },
          { vetProfileId: profileId },
          { groomerProfileId: profileId },
        ],
        replyStatus: 'APPROVED',
      },
    });

    // Need at least 5 approved replies and 30-day clean streak to auto-approve
    return approvedReplies >= 5;
  }

  private async updateLegacyPetFriendRating(petFriendUserId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: {
        OR: [
          { revieweeId: petFriendUserId },
          { providerUserId: petFriendUserId },
        ],
        isVisible: true,
        isPublished: true,
      },
      select: { rating: true, overallRating: true },
    });

    if (reviews.length === 0) return;

    const avg = reviews.reduce((s, r) => s + (r.rating ?? Number(r.overallRating ?? 0)), 0) / reviews.length;

    await this.prisma.petFriendProfile.updateMany({
      where: { userId: petFriendUserId },
      data: { avgRating: avg, totalReviews: reviews.length },
    });
  }
}
