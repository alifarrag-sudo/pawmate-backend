import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async computeSnapshot(providerType: string, providerProfileId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: {
        providerType: providerType as any,
        isVisible: true,
        OR: [
          { providerUserId: providerProfileId },
          { kennelProfileId: providerProfileId },
          { petHotelProfileId: providerProfileId },
          { shopProfileId: providerProfileId },
          { vetProfileId: providerProfileId },
          { groomerProfileId: providerProfileId },
        ],
      },
      select: { rating: true, tags: true, replyStatus: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalReviews = reviews.length;
    const ratingSum = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalReviews > 0
      ? Math.round((ratingSum / totalReviews) * 10) / 10
      : 0;

    const distribution: Record<string, number> = {
      '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
    };
    let fiveStarCount = 0;
    for (const r of reviews) {
      distribution[String(r.rating)] = (distribution[String(r.rating)] || 0) + 1;
      if (r.rating === 5) fiveStarCount++;
    }

    const recent30 = reviews.slice(0, 30);
    const recentRating = recent30.length > 0
      ? Math.round((recent30.reduce((s, r) => s + r.rating, 0) / recent30.length) * 10) / 10
      : null;

    const repliedCount = reviews.filter(r => r.replyStatus === 'APPROVED').length;
    const responseRate = totalReviews > 0
      ? Math.round((repliedCount / totalReviews) * 100)
      : null;

    // Top tags by frequency
    const tagCounts: Record<string, number> = {};
    for (const r of reviews) {
      for (const tag of r.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    await this.prisma.reputationSnapshot.upsert({
      where: {
        providerType_providerProfileId: {
          providerType: providerType as any,
          providerProfileId,
        },
      },
      create: {
        providerType: providerType as any,
        providerProfileId,
        totalReviews,
        averageRating,
        ratingDistribution: distribution,
        fiveStarCount,
        recentRating,
        responseRate,
        topTags,
      },
      update: {
        totalReviews,
        averageRating,
        ratingDistribution: distribution,
        fiveStarCount,
        recentRating,
        responseRate,
        topTags,
        computedAt: new Date(),
      },
    });

    this.logger.log(
      `Reputation snapshot updated: ${providerType}/${providerProfileId} — avg=${averageRating}, total=${totalReviews}`,
    );

    // Commission tier check
    await this.checkCommissionTier(providerType, providerProfileId, averageRating, totalReviews);
  }

  private async checkCommissionTier(
    providerType: string,
    profileId: string,
    avgRating: number,
    totalReviews: number,
  ): Promise<void> {
    const newRate = (avgRating >= 4.5 && totalReviews >= 20) ? 0.10 : 0.15;

    if (providerType === 'PETFRIEND') {
      const profile = await this.prisma.petFriendProfile.findUnique({
        where: { id: profileId },
      });
      if (profile && profile.commissionRate !== newRate) {
        await this.prisma.petFriendProfile.update({
          where: { id: profileId },
          data: { commissionRate: newRate },
        });
        if (newRate === 0.10) {
          this.events.emit('provider.tier_upgraded', {
            providerType,
            profileId,
            newRate,
          });
        }
      }
    } else if (providerType === 'TRAINER') {
      const profile = await this.prisma.trainerProfile.findUnique({
        where: { id: profileId },
      });
      if (profile && profile.commissionRate !== newRate) {
        await this.prisma.trainerProfile.update({
          where: { id: profileId },
          data: { commissionRate: newRate },
        });
        if (newRate === 0.10) {
          this.events.emit('provider.tier_upgraded', {
            providerType,
            profileId,
            newRate,
          });
        }
      }
    }
    // Kennel/PetHotel/Shop/Vet/Groomer use BusinessProfile-level commission (future)
  }
}
