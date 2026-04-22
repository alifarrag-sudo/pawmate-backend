import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PetFriendStatus, ProviderPayoutMethod } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Commission rate constants (mirrored from petfriend.service.ts — keep in sync)
// ──────────────────────────────────────────────────────────────────────────────
const COMMISSION_ELITE   = 0.10;
const COMMISSION_DEFAULT = 0.15;
const ELITE_MIN_RATING   = 4.5;
const ELITE_MIN_BOOKINGS = 20;

function resolveCommissionRate(avgRating: number, totalBookings: number): number {
  return avgRating >= ELITE_MIN_RATING && totalBookings >= ELITE_MIN_BOOKINGS
    ? COMMISSION_ELITE
    : COMMISSION_DEFAULT;
}

@Injectable()
export class PetFriendPayoutService {
  private readonly logger = new Logger(PetFriendPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Bi-monthly scheduled payout — runs at 06:00 on the 1st and 15th of each month
  // ──────────────────────────────────────────────────────────────────────────
  @Cron('0 6 1,15 * *')
  async runScheduledPayouts() {
    this.logger.log('Starting bi-monthly scheduled payout run...');

    const profiles = await this.prisma.petFriendProfile.findMany({
      where: {
        status:             PetFriendStatus.APPROVED,
        pendingBalanceEgp:  { gt: 0 },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (profiles.length === 0) {
      this.logger.log('No profiles with pending balances — payout run complete.');
      return;
    }

    let successCount = 0;
    let failedCount  = 0;

    const scheduledFor = new Date();

    for (const profile of profiles) {
      try {
        const pendingAmount   = profile.pendingBalanceEgp;
        const commissionRate  = resolveCommissionRate(
          Number(profile.avgRating),
          profile.totalBookings,
        );
        const commissionEgp  = Math.round(pendingAmount * commissionRate);
        const netEgp         = pendingAmount - commissionEgp;

        // Determine payout method from stored JSON or fall back to bank_transfer
        const payoutMethodRaw = (profile.payoutMethodJson as any)?.method;
        const payoutMethod: ProviderPayoutMethod =
          isValidPayoutMethod(payoutMethodRaw)
            ? (payoutMethodRaw as ProviderPayoutMethod)
            : ProviderPayoutMethod.bank_transfer;

        const payout = await this.prisma.petFriendPayout.create({
          data: {
            petFriendId:        profile.userId,
            petFriendProfileId: profile.id,
            amount:             pendingAmount,
            payoutMethod,
            status:             'pending',
            type:               'SCHEDULED',
            commissionEgp,
            netEgp,
            scheduledFor,
            requestedAt:        scheduledFor,
            bookingsCount:      profile.totalBookings,
          },
        });

        // Move pending balance to zero — available balance updated once payment confirmed
        await this.prisma.petFriendProfile.update({
          where: { id: profile.id },
          data: {
            pendingBalanceEgp: 0,
            lastPayoutAt:      scheduledFor,
          },
        });

        // TODO: Integrate with Paymob disbursement API once credentials are confirmed.
        // Example call (stubbed):
        // await this.paymobService.createDisbursement({
        //   reference:   payout.id,
        //   amount:      netEgp,
        //   currency:    'EGP',
        //   destination: (profile.payoutMethodJson as any)?.destination,
        //   method:      payoutMethod,
        // });

        this.eventEmitter.emit('payout.scheduled_created', {
          profileId:  profile.id,
          userId:     profile.userId,
          payoutId:   payout.id,
          amount:     pendingAmount,
          commissionEgp,
          netEgp,
          scheduledFor,
        });

        successCount++;
        this.logger.log(
          `Payout created for profile ${profile.id}: ${netEgp} EGP net (commission: ${commissionEgp} EGP)`,
        );
      } catch (err: any) {
        failedCount++;
        this.logger.error(
          `Failed to create payout for profile ${profile.id}: ${err?.message}`,
          err?.stack,
        );
      }
    }

    this.logger.log(
      `Scheduled payout run complete — success: ${successCount}, failed: ${failedCount}, total: ${profiles.length}`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper — validate payout method string against Prisma enum values
// ──────────────────────────────────────────────────────────────────────────────
function isValidPayoutMethod(value: unknown): value is ProviderPayoutMethod {
  return (
    typeof value === 'string' &&
    Object.values(ProviderPayoutMethod).includes(value as ProviderPayoutMethod)
  );
}
