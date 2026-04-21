import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymobService } from './paymob.service';
import { NotificationsService } from '../notifications/notifications.service';

const TEST_PAYMENT_METHODS = ['test', 'card_test', 'mock'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private paymob: PaymobService,
    private notifications: NotificationsService,
  ) {}

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  @OnEvent('booking.confirmed')
  async onBookingConfirmed({ booking }: any) {
    await this.capturePayment(booking.id);
  }

  @OnEvent('booking.cancelled')
  async onBookingCancelled({ booking, cancelledBy, cancellationType, hoursBeforeStart }: any) {
    await this.processRefund(booking.id, cancelledBy, cancellationType, hoursBeforeStart);
  }

  // ============================================================
  // PAYMENT AUTHORIZATION
  // ============================================================

  async authorizePayment(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { parent: true },
    });

    if (!booking) return;

    const idempotencyKey = `auth:${bookingId}`;
    const alreadyProcessed = await this.checkIdempotency(idempotencyKey);
    if (alreadyProcessed) return;

    try {
      if (booking.paymentMethod === 'platform_wallet') {
        const owner = await this.prisma.user.findUnique({
          where: { id: booking.parentId },
          select: { walletBalance: true },
        });

        if (!owner || Number(owner.walletBalance) < Number(booking.totalPrice)) {
          await this.prisma.booking.update({
            where: { id: bookingId },
            data: { paymentStatus: 'failed' },
          });
          this.logger.warn(`Insufficient wallet balance for booking ${bookingId}`);
          return;
        }

        await this.prisma.user.update({
          where: { id: booking.parentId },
          data: { walletBalance: { decrement: Number(booking.totalPrice) } },
        });

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: 'authorized', paymentAuthorizedAt: new Date() },
        });
      } else {
        const result = await this.paymob.authorizePayment({
          amountCents: Math.round(Number(booking.totalPrice) * 100),
          currency: 'EGP',
          orderId: bookingId,
          customerFirstName: booking.parent.firstName,
          customerLastName: booking.parent.lastName,
          customerPhone: booking.parent.phone,
        });

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: result.success ? 'authorized' : 'failed',
            paymentReference: result.transactionId,
            paymentAuthorizedAt: result.success ? new Date() : undefined,
          },
        });
      }
    } catch (error: any) {
      this.logger.error(`Payment authorization failed for booking ${bookingId}: ${error.message}`);
      await this.prisma.paymentTransaction.create({
        data: {
          userId: booking.parentId,
          bookingId,
          type: 'booking_payment',
          amount: Number(booking.totalPrice),
          direction: 'debit',
          status: 'failed',
          gateway: booking.paymentMethod as any,
          errorMessage: error.message,
        },
      });
    }
  }

  // ============================================================
  // PAYMENT CAPTURE
  // ============================================================

  async capturePayment(bookingId: string): Promise<void> {
    const idempotencyKey = `capture:${bookingId}`;
    const alreadyProcessed = await this.checkIdempotency(idempotencyKey);
    if (alreadyProcessed) {
      this.logger.log(`Capture already processed for booking ${bookingId}`);
      return;
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.paymentStatus !== 'authorized') return;

    try {
      if (booking.paymentMethod === 'platform_wallet') {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: 'captured', paymentCapturedAt: new Date() },
        });
      } else {
        const result = await this.paymob.capturePayment(
          booking.paymentReference!,
          Math.round(Number(booking.totalPrice) * 100),
        );

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: result.success ? 'captured' : 'failed',
            paymentCapturedAt: result.success ? new Date() : undefined,
          },
        });
      }

      await this.prisma.paymentTransaction.create({
        data: {
          userId: booking.parentId,
          bookingId,
          type: 'booking_payment',
          amount: Number(booking.totalPrice),
          direction: 'debit',
          status: 'success',
          gateway: booking.paymentMethod as any,
          gatewayRef: booking.paymentReference,
          processedAt: new Date(),
        },
      });

      this.logger.log(`Payment captured for booking ${bookingId}`);
    } catch (error: any) {
      this.logger.error(`Payment capture failed for booking ${bookingId}: ${error.message}`);
    }
  }

  // ============================================================
  // REFUNDS
  // ============================================================

  async processRefund(
    bookingId: string,
    cancelledBy: string,
    cancellationType: string,
    hoursBeforeStart: number,
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return;

    let ownerRefundPercent = 0;
    let sitterCompensationPercent = 0;

    if (cancelledBy === 'owner') {
      if (cancellationType === 'owner_24h_plus') {
        ownerRefundPercent = 100;
      } else if (cancellationType === 'owner_24h_minus') {
        ownerRefundPercent = 50;
        sitterCompensationPercent = 25;
      } else {
        ownerRefundPercent = 0;
        sitterCompensationPercent = 50;
      }
    } else {
      ownerRefundPercent = 100;
      sitterCompensationPercent = 0;
      await this.addPlatformCredit(booking.parentId, 50, 'sitter_cancellation_apology', bookingId);
    }

    const ownerRefundAmount = Number(booking.totalPrice) * ownerRefundPercent / 100;
    const sitterCompensation = Number(booking.basePrice) * sitterCompensationPercent / 100;

    if (booking.paymentStatus === 'authorized') {
      if (ownerRefundPercent === 100) {
        await this.paymob.voidAuthorization(booking.paymentReference!);
      } else if (ownerRefundPercent < 100) {
        const captureAmount = Math.round(Number(booking.totalPrice) * 100);
        await this.paymob.capturePayment(booking.paymentReference!, captureAmount);
        if (ownerRefundAmount > 0) {
          await this.paymob.refund(booking.paymentReference!, Math.round(ownerRefundAmount * 100));
        }
      }
    } else if (booking.paymentStatus === 'captured' && ownerRefundAmount > 0) {
      await this.paymob.refund(booking.paymentReference!, Math.round(ownerRefundAmount * 100));
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: ownerRefundPercent === 100 ? 'refunded' : 'partially_refunded',
        paymentRefundedAt: new Date(),
        refundAmount: ownerRefundAmount,
        refundReason: `Cancellation by ${cancelledBy}`,
      },
    });

    if (sitterCompensation > 0) {
      await this.prisma.petFriendPayout.create({
        data: {
          petFriendId: booking.petFriendId,
          bookingId,
          amount: sitterCompensation,
          payoutMethod: 'platform_wallet',
          status: 'pending',
        },
      });
      await this.addPlatformCredit(booking.petFriendId, sitterCompensation, 'cancellation_compensation', bookingId);
    }

    this.logger.log(`Refund processed for booking ${bookingId}: owner ${ownerRefundPercent}%, sitter ${sitterCompensationPercent}%`);
  }

  // ============================================================
  // WALLET
  // ============================================================

  async getWalletBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true, currency: true },
    });
    return { balance: Number(user?.walletBalance || 0), currency: user?.currency || 'EGP' };
  }

  async addPlatformCredit(userId: string, amount: number, reason: string, referenceId?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      }),
      this.prisma.paymentTransaction.create({
        data: {
          userId,
          bookingId: referenceId,
          type: 'compensation',
          amount,
          direction: 'credit',
          status: 'success',
          gateway: 'platform',
          processedAt: new Date(),
        },
      }),
    ]);
  }

  // ============================================================
  // PAYMOB WEBHOOK HANDLER
  // ============================================================

  async handlePaymobWebhook(body: any, signature: string): Promise<{ received: boolean }> {
    try {
      const isValid = this.paymob.validateWebhook(body, signature);
      if (!isValid) {
        // Return 200 + log — Paymob retries forever on non-2xx
        this.logger.warn('Invalid Paymob webhook signature — ignoring payload');
        return { received: true };
      }

      const { obj } = body;
      const transactionId = obj?.id?.toString();
      const success = obj?.success;
      const orderId = obj?.order?.merchant_order_id;

      this.logger.log(`Paymob webhook: transaction ${transactionId}, orderId ${orderId}, success=${success}`);

      // Deduplicate webhook events atomically via unique constraint
      if (transactionId) {
        try {
          await this.prisma.processedWebhookEvent.create({
            data: { eventId: transactionId, provider: 'paymob' },
          });
        } catch (e: any) {
          if (e.code === 'P2002') {
            this.logger.log(`Webhook event ${transactionId} already processed — skipping.`);
            return { received: true };
          }
          throw e;
        }
      }

      if (orderId && success) {
        const booking = await this.prisma.booking.findUnique({ where: { id: orderId } });
        if (booking && booking.paymentStatus === 'pending') {
          await this.prisma.booking.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'authorized',
              paymentReference: transactionId,
              paymentAuthorizedAt: new Date(),
            },
          });
        }
      }

      return { received: true };
    } catch (error: any) {
      // Always return 200 — Paymob retries forever on non-2xx
      this.logger.error(`Paymob webhook processing error: ${error.message}`, error.stack);
      return { received: true };
    }
  }

  // ============================================================
  // TRANSACTION HISTORY & PAYOUTS
  // ============================================================

  async getTransactionHistory(userId: string) {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { transactions };
  }

  async topUpWallet(userId: string, amount: number, paymentMethod?: string) {
    // FIX 2: Block test payment methods in production
    if (
      paymentMethod &&
      TEST_PAYMENT_METHODS.includes(paymentMethod) &&
      process.env.NODE_ENV === 'production'
    ) {
      throw new ForbiddenException('Test payment methods are not available in production.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
      select: { walletBalance: true },
    });

    // FIX 5: Catch P2002 for idempotency on duplicate transactions
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          userId,
          type: 'top_up',
          amount,
          direction: 'credit',
          status: 'success',
          gateway: 'platform',
          processedAt: new Date(),
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('This payment has already been processed.');
      }
      throw error;
    }

    return { balance: Number(user.walletBalance), message: 'Wallet topped up successfully' };
  }

  async getPayoutHistory(requestingUserId: string, petFriendId: string) {
    // FIX 9: Verify the requesting user owns this sitter profile
    const sitter = await this.prisma.petFriendProfile.findFirst({
      where: { userId: petFriendId },
      select: { id: true, userId: true },
    });

    if (!sitter || sitter.userId !== requestingUserId) {
      throw new ForbiddenException('You do not have permission to view this payout history.');
    }

    const payouts = await this.prisma.petFriendPayout.findMany({
      where: { petFriendId },
      orderBy: { createdAt: 'desc' },
    });
    return { payouts };
  }

  async requestWithdrawal(userId: string, amount: number, method: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });
    const balance = Number(user?.walletBalance || 0);
    if (amount < 50) throw new BadRequestException('Minimum withdrawal is 50 EGP.');
    if (amount > balance) throw new BadRequestException('Insufficient wallet balance.');

    const payoutMethod = method === 'bank_transfer' ? 'bank_transfer'
      : method === 'vodafone_cash' ? 'vodafone_cash'
      : 'platform_wallet';

    const payout = await this.prisma.petFriendPayout.create({
      data: {
        petFriendId: userId,
        amount,
        payoutMethod: payoutMethod as any,
        status: 'pending',
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: amount } },
    });

    return { payout, newBalance: balance - amount };
  }

  private async checkIdempotency(key: string): Promise<boolean> {
    const processed = await this.prisma.paymentTransaction.findFirst({
      where: { gatewayRef: key, status: 'success' },
    });
    return !!processed;
  }
}
