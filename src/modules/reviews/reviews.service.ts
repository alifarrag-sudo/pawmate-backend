import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async getReviewsForSitter(sitterId: string) {
    return this.prisma.review.findMany({
      where: { revieweeId: sitterId, isPublished: true },
      include: { reviewer: { select: { firstName: true, lastName: true, profilePhoto: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async submitReview(
    reviewerId: string,
    data: {
      bookingId: string;
      sitterId: string;
      rating: number;
      comment?: string;
      serviceType?: string;
    },
  ) {
    // Verify booking belongs to reviewer and is completed
    const booking = await this.prisma.booking.findFirst({
      where: { id: data.bookingId, ownerId: reviewerId, status: 'completed' },
    });
    if (!booking) throw new BadRequestException('Can only review completed bookings you own');

    // Check no duplicate review
    const existing = await this.prisma.review.findFirst({ where: { bookingId: data.bookingId } });
    if (existing) throw new ConflictException('Review already submitted for this booking');

    const review = await this.prisma.review.create({
      data: {
        bookingId: data.bookingId,
        reviewerId,
        revieweeId: data.sitterId,
        revieweeType: 'sitter',
        overallRating: data.rating,
        comment: data.comment ?? '',
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Update sitter avg rating
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: data.sitterId, isPublished: true },
    });
    const avg = reviews.reduce((s, r) => s + Number(r.overallRating), 0) / reviews.length;
    await this.prisma.sitterProfile.updateMany({
      where: { userId: data.sitterId },
      data: { avgRating: avg, totalReviews: reviews.length },
    });

    // Mark booking as reviewed
    await this.prisma.booking.update({
      where: { id: data.bookingId },
      data: { ownerReviewed: true },
    });

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
