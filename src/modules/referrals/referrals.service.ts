import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Generate a unique referral code for a user.
   * Format: uppercase first 3 chars of firstName + 3-digit random number (e.g., "ALI234")
   */
  async generateReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, referralCode: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.referralCode) return user.referralCode;

    let code: string;
    let attempts = 0;

    do {
      const prefix = (user.firstName || 'USR').toUpperCase().slice(0, 3).padEnd(3, 'X');
      const suffix = Math.floor(100 + Math.random() * 900).toString();
      code = `${prefix}${suffix}`;
      attempts++;
    } while (
      (await this.prisma.user.count({ where: { referralCode: code } })) > 0 &&
      attempts < 20
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
    });

    return code;
  }

  /**
   * Get or create referral code + share copy
   */
  async getShareInfo(userId: string) {
    const code = await this.generateReferralCode(userId);
    const shareMessage = `Join PawMateHub — pet care you can trust. Use code ${code} and we both get rewarded: https://pawmatehub.com/${code}`;

    return { code, shareMessage };
  }

  /**
   * Redeem a referral code during signup.
   * Called from auth service when a new user registers with a code.
   */
  async redeemCode(code: string, refereeUserId: string): Promise<void> {
    const referrer = await this.prisma.user.findFirst({
      where: { referralCode: code.toUpperCase() },
      select: { id: true },
    });

    if (!referrer) throw new BadRequestException('Invalid referral code');
    if (referrer.id === refereeUserId) {
      throw new BadRequestException('Cannot use your own referral code');
    }

    // Check if already redeemed by this user
    const existing = await this.prisma.referral.findFirst({
      where: { refereeUserId },
    });
    if (existing) throw new BadRequestException('Referral already applied');

    await this.prisma.referral.create({
      data: {
        referrerUserId: referrer.id,
        referralCode: code.toUpperCase(),
        refereeUserId,
        status: 'SIGNED_UP',
      },
    });

    this.logger.log(`Referral redeemed: code=${code} referee=${refereeUserId} referrer=${referrer.id}`);
    this.eventEmitter.emit('referral.signed_up', { referrerId: referrer.id, refereeId: refereeUserId, code });
  }

  /**
   * Get user's referral history and stats.
   */
  async getMyReferrals(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, accountCreditEgp: true },
    });

    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        referralCode: true,
        refereeRole: true,
        status: true,
        rewardEgp: true,
        rewardType: true,
        createdAt: true,
        qualifiedAt: true,
        rewardedAt: true,
        referee: { select: { firstName: true, lastName: true } },
      },
    });

    const stats = {
      signedUp: referrals.filter(r => r.status === 'SIGNED_UP').length,
      qualified: referrals.filter(r => r.status === 'QUALIFIED').length,
      rewarded: referrals.filter(r => r.status === 'REWARDED').length,
      totalEarned: referrals.reduce((sum, r) => sum + (r.rewardEgp || 0), 0),
    };

    return {
      code: user?.referralCode ?? null,
      accountCreditEgp: user?.accountCreditEgp ?? 0,
      referrals,
      stats,
    };
  }

  // Reward constants
  private static readonly PARENT_REFERRAL_REWARD_EGP = 50;   // parent referee → referrer gets credit
  private static readonly PETFRIEND_REFERRAL_REWARD_EGP = 75; // petfriend referee → referrer gets cash (wired in future)

  /**
   * Event handler: when new parent completes first booking.
   * Referrer gets 50 EGP credit.
   */
  @OnEvent('booking.completed')
  async onBookingCompleted({ booking }: any) {
    try {
      const parentId = booking.ownerId || booking.parentId;
      if (!parentId) return;

      // Check if this parent was referred
      const referral = await this.prisma.referral.findFirst({
        where: {
          refereeUserId: parentId,
          status: 'SIGNED_UP',
        },
      });
      if (!referral) return;

      // Check if this is their first completed booking
      const completedCount = await this.prisma.booking.count({
        where: {
          parentId: parentId,
          status: 'completed',
        },
      });
      if (completedCount !== 1) return; // only trigger on first

      // Qualify the referral
      await this.prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'QUALIFIED',
          qualifiedAt: new Date(),
          refereeRole: 'PARENT',
          qualifyingEventId: booking.id,
        },
      });

      // Reward: PARENT_REFERRAL_REWARD_EGP credit to referrer
      const reward = ReferralsService.PARENT_REFERRAL_REWARD_EGP;
      await this.prisma.$transaction([
        this.prisma.referral.update({
          where: { id: referral.id },
          data: {
            status: 'REWARDED',
            rewardedAt: new Date(),
            rewardEgp: reward,
            rewardType: 'CREDIT',
          },
        }),
        this.prisma.user.update({
          where: { id: referral.referrerUserId },
          data: { accountCreditEgp: { increment: reward } },
        }),
      ]);

      this.eventEmitter.emit('referral.rewarded', {
        referrerId: referral.referrerUserId,
        refereeId: parentId,
        rewardEgp: reward,
        rewardType: 'CREDIT',
      });

      this.logger.log(`Referral rewarded: referrer=${referral.referrerUserId} reward=${reward} EGP credit`);
    } catch (err: any) {
      this.logger.error(`Referral qualification failed: ${err.message}`);
    }
  }

  /**
   * Backfill: generate referral codes for existing users who don't have one.
   */
  async backfillReferralCodes(): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { referralCode: null, isActive: true },
      select: { id: true, firstName: true },
    });

    let count = 0;
    for (const user of users) {
      try {
        await this.generateReferralCode(user.id);
        count++;
      } catch (err: any) {
        this.logger.warn(`Failed to generate code for ${user.id}: ${err.message}`);
      }
    }

    this.logger.log(`Backfilled referral codes for ${count} users`);
    return count;
  }
}
