import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentsService } from './payments.service';
import { PaymobService } from './paymob.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Tests cover the new Paymob intent + status flow plus the webhook update
 * that sets `paidAt` and emits `booking.payment_succeeded`. Production
 * Paymob HTTP calls are stubbed via the PaymobService mock — no real
 * money path exercised.
 */
describe('PaymentsService — Paymob intent / status / webhook', () => {
  let service: PaymentsService;
  let prisma: {
    booking: { findUnique: jest.Mock; update: jest.Mock };
    paymentTransaction: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    processedWebhookEvent: { create: jest.Mock };
  };
  let paymob: {
    authorizePayment: jest.Mock;
    capturePayment: jest.Mock;
    validateWebhook: jest.Mock;
  };
  let emitter: { emit: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      booking: { findUnique: jest.fn(), update: jest.fn() },
      paymentTransaction: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
      processedWebhookEvent: { create: jest.fn() },
    };
    paymob = {
      authorizePayment: jest.fn(),
      capturePayment: jest.fn(),
      validateWebhook: jest.fn(),
    };
    emitter = { emit: jest.fn() };
    config = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymobService, useValue: paymob },
        { provide: NotificationsService, useValue: { sendPushToUser: jest.fn() } },
        { provide: EventEmitter2, useValue: emitter },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  // ── createPaymobIntent ─────────────────────────────────────────────

  describe('createPaymobIntent', () => {
    const baseBooking = {
      id: 'b1',
      parentId: 'parent-1',
      totalPrice: 350 as any,
      paymentStatus: 'pending',
      parent: { firstName: 'Ali', lastName: 'Farrag', phone: '+201012345678' },
    };

    it('returns mock intent when PAYMOB_API_KEY is unset (dev/staging)', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({});
      config.get.mockImplementation((key: string) => {
        if (key === 'PAYMOB_API_KEY') return undefined;
        return undefined;
      });

      const result = await service.createPaymobIntent('parent-1', 'b1');

      expect(result.isMock).toBe(true);
      expect(result.intentId).toBe('mock_b1');
      expect(result.iframeUrl).toBeNull();
      expect(result.amount).toBe(350);
      expect(result.currency).toBe('EGP');
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { paymobIntentId: 'mock_b1' },
      });
      // Real Paymob API must NOT be called when key is missing.
      expect(paymob.authorizePayment).not.toHaveBeenCalled();
    });

    it('returns real intent + iframeUrl when PAYMOB_API_KEY + IFRAME_ID are set', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({});
      config.get.mockImplementation((key: string) => {
        if (key === 'PAYMOB_API_KEY') return 'pk_live_xxx';
        if (key === 'PAYMOB_IFRAME_ID') return '12345';
        return undefined;
      });
      paymob.authorizePayment.mockResolvedValue({
        success: true,
        transactionId: 'pmb_token_abc',
      });

      const result = await service.createPaymobIntent('parent-1', 'b1');

      expect(paymob.authorizePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 35000,
          currency: 'EGP',
          orderId: 'b1',
        }),
      );
      expect(result.intentId).toBe('pmb_token_abc');
      expect(result.iframeUrl).toBe(
        'https://accept.paymob.com/api/acceptance/iframes/12345?payment_token=pmb_token_abc',
      );
      expect(result.isMock).toBeUndefined();
    });

    it('throws ForbiddenException when caller does not own the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({ ...baseBooking, parentId: 'someone-else' });
      await expect(service.createPaymobIntent('parent-1', 'b1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(service.createPaymobIntent('parent-1', 'b1')).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when booking is not in pending payment state', async () => {
      prisma.booking.findUnique.mockResolvedValue({ ...baseBooking, paymentStatus: 'captured' });
      await expect(service.createPaymobIntent('parent-1', 'b1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── getPaymobStatus ─────────────────────────────────────────────────

  describe('getPaymobStatus', () => {
    it('returns paid + paidAt for a captured booking', async () => {
      const paidAt = new Date('2026-05-01T12:00:00.000Z');
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 350 as any,
        paymentStatus: 'captured',
        paidAt,
      });

      const result = await service.getPaymobStatus('parent-1', 'b1');

      expect(result).toEqual({
        status: 'paid',
        bookingId: 'b1',
        amount: 350,
        paidAt: paidAt.toISOString(),
      });
    });

    it('returns paid for an authorized booking (money is in)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 100 as any,
        paymentStatus: 'authorized',
        paidAt: null,
      });
      const r = await service.getPaymobStatus('parent-1', 'b1');
      expect(r.status).toBe('paid');
    });

    it('returns failed for failed/voided/refunded bookings', async () => {
      for (const ps of ['failed', 'voided', 'refunded']) {
        prisma.booking.findUnique.mockResolvedValue({
          id: 'b1',
          parentId: 'parent-1',
          totalPrice: 100 as any,
          paymentStatus: ps,
          paidAt: null,
        });
        const r = await service.getPaymobStatus('parent-1', 'b1');
        expect(r.status).toBe('failed');
      }
    });

    it('returns pending for an unpaid booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 100 as any,
        paymentStatus: 'pending',
        paidAt: null,
      });
      const r = await service.getPaymobStatus('parent-1', 'b1');
      expect(r.status).toBe('pending');
      expect(r.paidAt).toBeNull();
    });

    it('throws ForbiddenException when caller does not own the booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'someone-else',
        totalPrice: 100 as any,
        paymentStatus: 'pending',
        paidAt: null,
      });
      await expect(service.getPaymobStatus('parent-1', 'b1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── handlePaymobWebhook ─────────────────────────────────────────────

  describe('handlePaymobWebhook', () => {
    const validPayload = {
      obj: {
        id: 12345,
        success: true,
        order: { id: 'order-1', merchant_order_id: 'b1' },
      },
    };

    it('on valid HMAC + success: updates booking, sets paidAt, emits event', async () => {
      paymob.validateWebhook.mockReturnValue(true);
      prisma.processedWebhookEvent.create.mockResolvedValue({});
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 350 as any,
        paymentStatus: 'pending',
      });
      prisma.booking.update.mockResolvedValue({});

      const result = await service.handlePaymobWebhook(validPayload, 'sig');

      expect(result).toEqual({ received: true });
      expect(prisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({
            paymentStatus: 'authorized',
            paymentReference: '12345',
            paymobOrderId: 'order-1',
          }),
        }),
      );
      // paidAt should be a Date, set on this update
      const updateCall = prisma.booking.update.mock.calls[0][0].data;
      expect(updateCall.paidAt).toBeInstanceOf(Date);

      expect(emitter.emit).toHaveBeenCalledWith(
        'booking.payment_succeeded',
        expect.objectContaining({
          bookingId: 'b1',
          parentId: 'parent-1',
          transactionId: '12345',
          amount: 350,
        }),
      );
    });

    it('on invalid HMAC: returns 200, does NOT mutate booking, does NOT emit', async () => {
      paymob.validateWebhook.mockReturnValue(false);

      const result = await service.handlePaymobWebhook(validPayload, 'bad-sig');

      expect(result).toEqual({ received: true });
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('idempotency: a duplicate webhook for the same transaction is skipped', async () => {
      paymob.validateWebhook.mockReturnValue(true);
      prisma.processedWebhookEvent.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.handlePaymobWebhook(validPayload, 'sig');

      expect(result).toEqual({ received: true });
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('does not transition a booking that is no longer pending (e.g. already authorized)', async () => {
      paymob.validateWebhook.mockReturnValue(true);
      prisma.processedWebhookEvent.create.mockResolvedValue({});
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 350 as any,
        paymentStatus: 'authorized',
      });

      await service.handlePaymobWebhook(validPayload, 'sig');

      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('mock-bypass: flips booking to paid when signature is "mock-bypass" AND PAYMOB_API_KEY is unset', async () => {
      paymob.validateWebhook.mockReturnValue(false); // bogus mock HMAC won't validate
      config.get.mockImplementation((key: string) =>
        key === 'PAYMOB_API_KEY' ? undefined : undefined,
      );
      prisma.processedWebhookEvent.create.mockResolvedValue({});
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        totalPrice: 350 as any,
        paymentStatus: 'pending',
      });
      prisma.booking.update.mockResolvedValue({});

      const result = await service.handlePaymobWebhook(validPayload, 'mock-bypass');

      expect(result).toEqual({ received: true });
      expect(prisma.booking.update).toHaveBeenCalled();
      expect(emitter.emit).toHaveBeenCalledWith(
        'booking.payment_succeeded',
        expect.objectContaining({ bookingId: 'b1' }),
      );
    });

    it('mock-bypass: REFUSES to bypass HMAC when PAYMOB_API_KEY is set (production)', async () => {
      paymob.validateWebhook.mockReturnValue(false);
      config.get.mockImplementation((key: string) =>
        key === 'PAYMOB_API_KEY' ? 'pk_live_xxx' : undefined,
      );

      const result = await service.handlePaymobWebhook(validPayload, 'mock-bypass');

      expect(result).toEqual({ received: true });
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });
});
