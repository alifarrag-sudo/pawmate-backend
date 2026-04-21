import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getReviewsForSitter(petFriendId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: petFriendId, isPublished: true },
      include: { reviewer: { select: { firstName: true, lastName: true, profilePhoto: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async submitReview(
    reviewerId: string,
    data: {
      bookingId: string;
      petFriendId: string;
      rating: number;
      comment?: string;
      serviceType?: string;
    },
  ) {
    if (!data.bookingId) throw new BadRequestException('bookingId is required');
    if (!data.petFriendId) throw new BadRequestException('petFriendId is required');
    if (!data.rating || data.rating < 1 || data.rating > 5) throw new BadRequestException('rating must be between 1 and 5');

    // Verify booking belongs to reviewer and is completed
    const booking = await this.prisma.booking.findFirst({
      where: { id: data.bookingId, parentId: reviewerId, status: 'completed' },
    });
    if (!booking) throw new BadRequestException('Can only review completed bookings you own');

    // Check no duplicate review
    const existing = await this.prisma.review.findFirst({ where: { bookingId: data.bookingId } });
    if (existing) throw new ConflictException('Review already submitted for this booking');

    const review = await this.prisma.review.create({
      data: {
        bookingId: data.bookingId,
        reviewerId,
        revieweeId: data.petFriendId,
        revieweeType: 'petfriend',
        overallRating: data.rating,
        comment: data.comment ?? '',
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Update sitter avg rating
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: data.petFriendId, isPublished: true },
    });
    const avg = reviews.reduce((s, r) => s + Number(r.overallRating), 0) / reviews.length;
    await this.prisma.petFriendProfile.updateMany({
      where: { userId: data.petFriendId },
      data: { avgRating: avg, totalReviews: reviews.length },
    });

    // Mark booking as reviewed
    await this.prisma.booking.update({
      where: { id: data.bookingId },
      data: { parentReviewed: true },
    });

    this.eventEmitter.emit('review.posted', { review, bookingId: data.bookingId, rating: data.rating, reviewerId });

    return review;
  }

  async getMyReviews(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: userId, isPublished: true },
      include: { reviewer: { select: { firstName: true, lastName: true, profilePhoto: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    return reviews.map(r => ({
      ...r,
      rating: Number(r.overallRating),
      createdAt: r.submittedAt,
    }));
  }
}
