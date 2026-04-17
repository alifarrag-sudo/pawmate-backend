import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getPriceRange, computeSitterTier } from '../../common/utils/pricing.util';

const OFFER_TTL_HOURS = 24;

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── CREATE OFFER (owner → sitter) ────────────────────────────────────────

  async createOffer(ownerId: string, body: {
    petFriendId: string;
    service: string;
    ownerPrice: number;
    message?: string;
  }) {
    // Resolve sitter: body.petFriendId can be a sitter profile ID or a user ID
    let sitterProfile = await this.prisma.petFriendProfile.findUnique({ where: { id: body.petFriendId } });
    if (!sitterProfile) {
      sitterProfile = await this.prisma.petFriendProfile.findUnique({ where: { userId: body.petFriendId } });
    }
    if (!sitterProfile) {
      throw new NotFoundException('Sitter not found');
    }

    // Offer.petFriendId is the sitter's user ID (not profile ID)
    const resolvedSitterId = sitterProfile.userId;

    const profile = sitterProfile;
    const tier = computeSitterTier(profile.totalReviews, Number(profile.avgRating));
    const range = getPriceRange(body.service, tier, (profile as any).isVerifiedTrainer);

    // Warn (not block) if below 70% of listed price — we just let it through
    // The check is done on the mobile side for UX warning; server allows it

    // Check no existing PENDING offer from this owner to this sitter for this service
    const existing = await this.prisma.offer.findFirst({
      where: {
        parentId: ownerId,
        petFriendId: resolvedSitterId,
        service: body.service as any,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new BadRequestException({
        error: 'OFFER_EXISTS',
        message: 'You already have a pending offer for this service with this sitter.',
      });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 3600 * 1000);

    const offer = await this.prisma.offer.create({
      data: {
        parentId: ownerId,
        petFriendId: resolvedSitterId,
        service: body.service as any,
        parentPrice: body.ownerPrice,
        round: 1,
        expiresAt,
        message: body.message || null,
      },
      include: {
        parent: { select: { firstName: true, lastName: true } },
        petFriend: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify sitter
    const ownerName = `${offer.parent.firstName} ${offer.parent.lastName}`;
    const serviceLabel = body.service.replace(/_/g, ' ');
    await this.notifications.sendPushToUser(resolvedSitterId, {
      title: '💰 New Price Offer',
      body: `${ownerName} offered ${body.ownerPrice} EGP for ${serviceLabel}`,
      data: { type: 'offer_received', offerId: offer.id },
    });
    await this.notifications.saveNotification(
      resolvedSitterId, 'offer_received', 'New Price Offer',
      `${ownerName} offered ${body.ownerPrice} EGP for ${serviceLabel}`,
      { offerId: offer.id },
    );

    return { ...offer, priceRange: range, tier };
  }

  // ─── GET MY OFFERS (owner or sitter) ──────────────────────────────────────

  async getMyOffers(userId: string, role: 'owner' | 'sitter') {
    const where = role === 'owner' ? { parentId: userId } : { petFriendId: userId };
    return this.prisma.offer.findMany({
      where,
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        petFriend: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── ACCEPT OFFER ─────────────────────────────────────────────────────────

  async acceptOffer(userId: string, offerId: string) {
    const offer = await this.loadAndValidate(offerId, userId, ['owner', 'sitter']);

    if (!['PENDING', 'COUNTERED'].includes(offer.status)) {
      throw new BadRequestException({ error: 'OFFER_NOT_ACTIONABLE', message: 'Offer cannot be accepted in its current state.' });
    }

    // Determine who is accepting and if it's valid
    const isPetFriend = offer.petFriendId === userId;
    const isOwner = offer.parentId === userId;

    // Sitter can accept PENDING (round 1) offer
    // Owner can accept COUNTERED (round 2) offer
    if (isPetFriend && offer.status !== 'PENDING') {
      throw new ForbiddenException('Sitter can only accept initial offers.');
    }
    if (isOwner && offer.status !== 'COUNTERED') {
      throw new ForbiddenException('Owner can only accept counter-offers.');
    }

    const finalPrice = offer.status === 'COUNTERED'
      ? offer.providerCounter!
      : offer.parentPrice;

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED', finalPrice },
      include: {
        parent: { select: { firstName: true, lastName: true } },
        petFriend: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify the other party
    if (isPetFriend) {
      // Sitter accepted → notify owner, create draft booking
      const sitterName = `${updated.petFriend.firstName} ${updated.petFriend.lastName}`;
      await this.notifications.sendPushToUser(offer.parentId, {
        title: '✅ Offer Accepted!',
        body: `${sitterName} accepted your offer of ${Number(finalPrice)} EGP. Tap to confirm booking.`,
        data: { type: 'offer_accepted', offerId: offer.id },
      });
      await this.notifications.saveNotification(
        offer.parentId, 'offer_accepted', 'Offer Accepted!',
        `${sitterName} accepted your offer. Tap to confirm booking.`,
        { offerId: offer.id },
      );
    } else {
      // Owner accepted counter → notify sitter
      const ownerName = `${updated.parent.firstName} ${updated.parent.lastName}`;
      await this.notifications.sendPushToUser(offer.petFriendId, {
        title: '✅ Counter Accepted',
        body: `${ownerName} accepted your counter offer of ${Number(finalPrice)} EGP.`,
        data: { type: 'offer_accepted', offerId: offer.id },
      });
      await this.notifications.saveNotification(
        offer.petFriendId, 'counter_accepted', 'Counter Accepted',
        `${ownerName} accepted your counter offer.`,
        { offerId: offer.id },
      );
    }

    return updated;
  }

  // ─── DECLINE OFFER ────────────────────────────────────────────────────────

  async declineOffer(userId: string, offerId: string) {
    const offer = await this.loadAndValidate(offerId, userId, ['owner', 'sitter']);

    if (!['PENDING', 'COUNTERED'].includes(offer.status)) {
      throw new BadRequestException({ error: 'OFFER_NOT_ACTIONABLE', message: 'Offer cannot be declined in its current state.' });
    }

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'DECLINED' },
      include: {
        parent: { select: { firstName: true, lastName: true } },
        petFriend: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify owner that offer was declined
    const sitterName = `${updated.petFriend.firstName} ${updated.petFriend.lastName}`;
    const serviceLabel = offer.service.toString().replace(/_/g, ' ');
    await this.notifications.sendPushToUser(offer.parentId, {
      title: '❌ Offer Declined',
      body: `${sitterName} declined your offer for ${serviceLabel}. Book at their listed price instead.`,
      data: { type: 'offer_declined', offerId: offer.id, petFriendId: offer.petFriendId },
    });
    await this.notifications.saveNotification(
      offer.parentId, 'offer_declined', 'Offer Declined',
      `${sitterName} declined your offer. Book at their listed price instead.`,
      { offerId: offer.id, petFriendId: offer.petFriendId },
    );

    return updated;
  }

  // ─── COUNTER OFFER (sitter → owner) ───────────────────────────────────────

  async counterOffer(petFriendId: string, offerId: string, counterPrice: number) {
    const offer = await this.loadAndValidate(offerId, petFriendId, ['sitter']);

    if (offer.status !== 'PENDING') {
      throw new BadRequestException({ error: 'OFFER_NOT_ACTIONABLE', message: 'Can only counter a pending offer.' });
    }
    if (offer.round >= 2) {
      throw new BadRequestException({ error: 'MAX_ROUNDS', message: 'Maximum negotiation rounds reached. Accept or decline only.' });
    }

    // Validate counter price is within tier range
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId: petFriendId },
    });
    if (profile) {
      const tier = computeSitterTier(profile.totalReviews, Number(profile.avgRating));
      const range = getPriceRange(offer.service as string, tier, (profile as any).isVerifiedTrainer);
      if (counterPrice < range.min || counterPrice > range.max) {
        throw new BadRequestException({
          error: 'PRICE_OUT_OF_RANGE',
          message: `Counter price must be between ${range.min} and ${range.max} EGP for your tier.`,
        });
      }
    }

    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'COUNTERED', providerCounter: counterPrice, round: 2 },
      include: {
        parent: { select: { firstName: true, lastName: true } },
        petFriend: { select: { firstName: true, lastName: true } },
      },
    });

    // Notify owner
    const sitterName = `${updated.petFriend.firstName} ${updated.petFriend.lastName}`;
    const serviceLabel = offer.service.toString().replace(/_/g, ' ');
    await this.notifications.sendPushToUser(offer.parentId, {
      title: '🔄 Counter Offer',
      body: `${sitterName} sent a counter-offer of ${counterPrice} EGP for ${serviceLabel}`,
      data: { type: 'offer_countered', offerId: offer.id },
    });
    await this.notifications.saveNotification(
      offer.parentId, 'offer_countered', 'Counter Offer Received',
      `${sitterName} sent a counter-offer of ${counterPrice} EGP.`,
      { offerId: offer.id },
    );

    return updated;
  }

  // ─── EXPIRE OFFERS (cron) ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async expireOffers() {
    const expired = await this.prisma.offer.findMany({
      where: { status: { in: ['PENDING', 'COUNTERED'] }, expiresAt: { lte: new Date() } },
      include: { parent: { select: { firstName: true, lastName: true } } },
    });

    if (expired.length === 0) return;

    await this.prisma.offer.updateMany({
      where: { id: { in: expired.map(o => o.id) } },
      data: { status: 'EXPIRED' },
    });

    // Notify owners their offer expired
    for (const offer of expired) {
      const serviceLabel = offer.service.toString().replace(/_/g, ' ');
      await this.notifications.sendPushToUser(offer.parentId, {
        title: '⏰ Offer Expired',
        body: `Your offer for ${serviceLabel} has expired. Book at the listed price instead.`,
        data: { type: 'offer_expired', offerId: offer.id, petFriendId: offer.petFriendId },
      });
    }

    this.logger.log(`Expired ${expired.length} offers`);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async loadAndValidate(offerId: string, userId: string, allowedRoles: string[]) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found');

    const isOwner = offer.parentId === userId;
    const isPetFriend = offer.petFriendId === userId;

    if (allowedRoles.includes('owner') && allowedRoles.includes('sitter')) {
      if (!isOwner && !isPetFriend) throw new ForbiddenException('Not your offer');
    } else if (allowedRoles.includes('sitter') && !isPetFriend) {
      throw new ForbiddenException('Only the sitter can perform this action');
    } else if (allowedRoles.includes('owner') && !isOwner) {
      throw new ForbiddenException('Only the owner can perform this action');
    }

    if (offer.status !== 'EXPIRED' && new Date() > offer.expiresAt) {
      await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
      throw new BadRequestException({ error: 'OFFER_EXPIRED', message: 'This offer has expired.' });
    }

    return offer;
  }
}
