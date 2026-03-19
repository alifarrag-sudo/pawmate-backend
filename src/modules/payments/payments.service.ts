import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymobService } from './paymob.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private paymob: PaymobService,
    private notifications: NotificationsService,
    @InjectQueue('payment-processor') private paymentQueue: Queue,
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
      include: { owner: true },
    });

    if (!booking) return;

    // Idempotency check
    const idempotencyKey = `auth:${bookingId}`;
    const alreadyProcessed = await this.checkIdempotency(idempotencyKey);
    if (alreadyProcessed) return;

    try {
      if (booking.paymentMethod === 'platform_wallet') {
        // Check wallet balance
        const owner = await this.prisma.user.findUnique({
          where: { id: booking.ownerId },
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

        // Soft reserve from wallet
        await this.prisma.user.update({
          where: { id: booking.ownerId },
          data: { walletBalance: { decrement: Number(booking.totalPrice) } },
        });

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: 'authorized', paymentAuthorizedAt: new Date() },
        });
      } else {
        // Paymob authorization
        const result = await this.paymob.authorizePayment({
          amountCents: Math.round(Number(booking.totalPrice) * 100),
          currency: 'EGP',
          orderId: bookingId,
          customerFirstName: booking.owner.firstName,
          customerLastName: booking.owner.lastName,
          customerPhone: booking.owner.phone,
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
          userId: booking.ownerId,
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
        // Already deducted from wallet at authorization
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

      // Log transaction
      await this.prisma.paymentTransaction.create({
        data: {
          userId: booking.ownerId,
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

      // Schedule sitter payout in 24 hours
      await this.paymentQueue.add(
        'payout-sitter',
        { bookingId },
        { delay: 24 * 60 * 60 * 1000, attempts: 3 },
      );

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
      // Add platform credit as apology
      await this.addPlatformCredit(booking.ownerId, 50, 'sitter_cancellation_apology', bookingId);
    }

    const ownerRefundAmount = Number(booking.totalPrice) * ownerRefundPercent / 100;
    const sitterCompensation = Number(booking.basePrice) * sitterCompensationPercent / 100;

    if (booking.paymentStatus === 'authorized') {
      if (ownerRefundPercent === 100) {
        await this.paymob.voidAuthorization(booking.paymentReference!);
      } else if (ownerRefundPercent < 100) {
        // Capture then partial refund
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
      await this.prisma.sitterPayout.create({
        data: {
          sitterId: booking.sitterId,
          bookingId,
          amount: sitterCompensation,
          payoutMethod: 'platform_wallet',
          status: 'pending',
        },
      });
      await this.addPlatformCredit(booking.sitterId, sitterCompensation, 'cancellation_compensation', bookingId);
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

  async handlePaymobWebhook(body: any, signature: string): Promise<void> {
    const isValid = this.paymob.validateWebhook(body, signature);
    if (!isValid) {
      this.logger.warn('Invalid Paymob webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    const { obj } = body;
    const transactionId = obj?.id?.toString();
    const success = obj?.success;
    const pending = obj?.pending;
    const orderId = obj?.order?.merchant_order_id;

    this.logger.log(`Paymob webhook: transaction ${transactionId}, orderId ${orderId}, success=${success}`);

    if (orderId && success) {
      // Update booking payment status
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

  async topUpWallet(userId: string, amount: number) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
      select: { walletBalance: true },
    });
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
    return { balance: Number(user.walletBalance), message: 'Wallet topped up successfully' };
  }

  async getPayoutHistory(userId: string) {
    const payouts = await this.prisma.sitterPayout.findMany({
      where: { sitterId: userId },
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

    // Map mobile method name to PayoutMethod enum
    const payoutMethod = method === 'bank_transfer' ? 'bank_transfer'
      : method === 'vodafone_cash' ? 'vodafone_cash'
      : 'platform_wallet';

    const payout = await this.prisma.sitterPayout.create({
      data: {
        sitterId: userId,
        amount,
        payoutMethod: payoutMethod as any,
        status: 'pending',
      },
    });

    // Deduct from wallet
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
