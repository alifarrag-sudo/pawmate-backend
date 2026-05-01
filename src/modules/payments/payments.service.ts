import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
    private eventEmitter: EventEmitter2,
    private config: ConfigService,
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
          this.eventEmitter.emit('payment.failed', { bookingId, error: 'Insufficient wallet balance', stage: 'authorization' });
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

      this.eventEmitter.emit('payment.succeeded', { bookingId, amount: Number(booking.totalPrice), method: booking.paymentMethod });
      this.logger.log(`Payment captured for booking ${bookingId}`);
    } catch (error: any) {
      this.eventEmitter.emit('payment.failed', { bookingId, error: error.message, stage: 'capture' });
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

    this.eventEmitter.emit('payment.refunded', { bookingId, ownerRefundAmount, ownerRefundPercent, sitterCompensationPercent });
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
  // PAYMOB PAYMENT INTENT (mobile + web pre-payment flow)
  // ============================================================

  /**
   * Create a Paymob payment intent for an authenticated parent's booking.
   *
   * Behaviour:
   *   • Loads the booking, asserts the requesting user owns it.
   *   • Asserts the booking is in a payable state (paymentStatus === 'pending').
   *   • If PAYMOB_API_KEY is set, creates a real Paymob order + payment key
   *     and returns the iframe URL the client embeds.
   *   • If PAYMOB_API_KEY is unset (dev/staging), returns a mock intent the
   *     client recognises as `isMock: true`. The mobile sandbox UI uses this
   *     to simulate a successful payment without going through Paymob.
   *
   * Side effects: persists `paymobIntentId` and `paymobOrderId` on the booking.
   */
  async createPaymobIntent(
    userId: string,
    bookingId: string,
  ): Promise<{
    intentId: string;
    paymentToken: string | null;
    iframeUrl: string | null;
    amount: number;
    currency: 'EGP';
    isMock?: boolean;
  }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { parent: true },
    });
    if (!booking) {
      throw new NotFoundException({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
    }
    if (booking.parentId !== userId) {
      throw new ForbiddenException({
        error: 'NOT_BOOKING_OWNER',
        message: 'You do not own this booking.',
      });
    }
    if (booking.paymentStatus !== 'pending') {
      throw new UnprocessableEntityException({
        error: 'BOOKING_NOT_PAYABLE',
        message: `Booking payment state is "${booking.paymentStatus}" — only pending bookings can request a new intent.`,
      });
    }

    const amountEgp = Math.round(Number(booking.totalPrice));
    const amountCents = amountEgp * 100;
    const apiKey = this.config.get<string>('PAYMOB_API_KEY');

    // ── Mock mode (no Paymob credentials) ────────────────────────────────
    if (!apiKey) {
      const intentId = `mock_${booking.id}`;
      const paymentToken = `mock_token_${Date.now()}`;
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { paymobIntentId: intentId },
      });
      this.logger.warn(
        `Paymob mock intent issued for booking ${booking.id} (PAYMOB_API_KEY not set)`,
      );
      return {
        intentId,
        paymentToken,
        iframeUrl: null,
        amount: amountEgp,
        currency: 'EGP',
        isMock: true,
      };
    }

    // ── Real Paymob authorization ────────────────────────────────────────
    const result = await this.paymob.authorizePayment({
      amountCents,
      currency: 'EGP',
      orderId: booking.id,
      customerFirstName: booking.parent?.firstName ?? 'Pet',
      customerLastName: booking.parent?.lastName ?? 'Parent',
      customerPhone: booking.parent?.phone ?? '+200000000000',
    });

    if (!result.success || !result.transactionId) {
      throw new BadRequestException({
        error: 'PAYMOB_AUTHORIZATION_FAILED',
        message: result.error ?? 'Paymob authorization failed. Please try again.',
      });
    }

    const intentId = result.transactionId;
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { paymobIntentId: intentId },
    });

    const iframeId = this.config.get<string>('PAYMOB_IFRAME_ID');
    const iframeUrl = iframeId
      ? `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${intentId}`
      : null;

    return {
      intentId,
      paymentToken: intentId,
      iframeUrl,
      amount: amountEgp,
      currency: 'EGP',
    };
  }

  /**
   * Read-only payment status for a booking, scoped to the owning parent.
   * Mobile polls this after the Paymob webview redirects on success/failure.
   */
  async getPaymobStatus(
    userId: string,
    bookingId: string,
  ): Promise<{
    status: 'pending' | 'paid' | 'failed';
    bookingId: string;
    amount: number;
    paidAt: string | null;
  }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        parentId: true,
        totalPrice: true,
        paymentStatus: true,
        paidAt: true,
      },
    });
    if (!booking) {
      throw new NotFoundException({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' });
    }
    if (booking.parentId !== userId) {
      throw new ForbiddenException({
        error: 'NOT_BOOKING_OWNER',
        message: 'You do not own this booking.',
      });
    }

    // Map the rich PaymentStatus enum onto the simple tri-state the mobile
    // client expects. Anything in the success-money-in path → paid.
    let status: 'pending' | 'paid' | 'failed' = 'pending';
    if (booking.paymentStatus === 'captured' || booking.paymentStatus === 'authorized') {
      status = 'paid';
    } else if (
      booking.paymentStatus === 'failed' ||
      booking.paymentStatus === 'voided' ||
      booking.paymentStatus === 'refunded' ||
      booking.paymentStatus === 'partially_refunded'
    ) {
      status = 'failed';
    }

    return {
      status,
      bookingId: booking.id,
      amount: Math.round(Number(booking.totalPrice)),
      paidAt: booking.paidAt ? booking.paidAt.toISOString() : null,
    };
  }

  // ============================================================
  // PAYMOB WEBHOOK HANDLER
  // ============================================================

  async handlePaymobWebhook(body: any, signature: string): Promise<{ received: boolean }> {
    try {
      const isValid = this.paymob.validateWebhook(body, signature);

      // Dev-only escape hatch: if PAYMOB_API_KEY is unset (the same gate the
      // /paymob/intent endpoint uses to return a mock intent), AND the caller
      // sends the mock-bypass signature, allow the payload through. In
      // production PAYMOB_API_KEY is always set, so this path is unreachable.
      const apiKey = this.config.get<string>('PAYMOB_API_KEY');
      const isMockBypass = !apiKey && signature === 'mock-bypass';

      if (!isValid && !isMockBypass) {
        // Return 200 + log — Paymob retries forever on non-2xx
        this.logger.warn('Invalid Paymob webhook signature — ignoring payload');
        return { received: true };
      }
      if (isMockBypass) {
        this.logger.warn('Paymob webhook accepted via mock-bypass (dev mode, PAYMOB_API_KEY unset)');
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
          const paidAt = new Date();
          await this.prisma.booking.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'authorized',
              paymentReference: transactionId,
              paymentAuthorizedAt: paidAt,
              paidAt,
              paymobOrderId: obj?.order?.id?.toString() ?? null,
            },
          });
          this.eventEmitter.emit('booking.payment_succeeded', {
            bookingId: booking.id,
            parentId: booking.parentId,
            transactionId,
            amount: Number(booking.totalPrice),
            paidAt: paidAt.toISOString(),
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
