/**
 * Suite 3 — Payment and Commission
 *
 * Tests commission tier upgrades via PetFriendService.incrementEarnings,
 * and Paymob webhook handling via PaymentsService.handlePaymobWebhook,
 * all at the service level with mocked Prisma and dependencies.
 */

import { ConfigService } from '@nestjs/config';
import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { PetFriendService } from '../../src/modules/petfriend/petfriend.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { PaymobService } from '../../src/modules/payments/paymob.service';
import { UploadsService } from '../../src/modules/uploads/uploads.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { createPetFriendProfile } from '../factories/petfriend.factory';
import { createBooking } from '../factories/booking.factory';

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockPaymobService() {
  return {
    authorizePayment: jest.fn().mockResolvedValue({ success: true, transactionId: 'txn-123' }),
    capturePayment: jest.fn().mockResolvedValue({ success: true }),
    refund: jest.fn().mockResolvedValue({ success: true }),
    voidAuthorization: jest.fn().mockResolvedValue({ success: true }),
    validateWebhook: jest.fn().mockReturnValue(true),
  };
}

function createMockUploadsService() {
  return {
    uploadImage: jest.fn().mockResolvedValue({ url: 'https://test.com/img.jpg', publicId: 'test' }),
  };
}

function createMockNotifications() {
  return {
    sendSms: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendPush: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockConfigService() {
  const config: Record<string, string> = {
    PAYMOB_HMAC_SECRET: 'test-hmac-secret',
    PAYMOB_API_KEY: 'test-api-key',
    PAYMOB_INTEGRATION_ID: 'test-integration-id',
    PLATFORM_COMMISSION_PERCENT: '15',
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue),
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Payment and Commission', () => {
  let ctx: TestContext;
  let petFriendService: PetFriendService;
  let paymentsService: PaymentsService;
  let mockPaymob: ReturnType<typeof createMockPaymobService>;

  beforeEach(async () => {
    mockPaymob = createMockPaymobService();

    ctx = await buildTestModule([
      PetFriendService,
      PaymentsService,
      { provide: PaymobService, useValue: mockPaymob },
      { provide: UploadsService, useValue: createMockUploadsService() },
      { provide: NotificationsService, useValue: createMockNotifications() },
      { provide: ConfigService, useValue: createMockConfigService() },
    ]);

    petFriendService = ctx.module.get(PetFriendService);
    paymentsService = ctx.module.get(PaymentsService);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: Commission tier upgrade at 20 bookings + 4.5+ rating
  // ────────────────────────────────────────────────────────────────────────

  it('should upgrade commission to 0.10 (elite) at 20 bookings with 4.8 rating', async () => {
    const profileId = 'elite-profile-1';
    const bookingId = 'booking-20th';

    // Profile at 19 bookings, 4.8 avgRating, 0.15 commission (standard)
    const preUpgradeProfile = createPetFriendProfile({
      id: profileId,
      userId: 'sitter-elite-1',
      totalBookings: 19,
      avgRating: 4.8,
      commissionRate: 0.15,
      pendingBalanceEgp: 500,
      totalEarnedEgp: 2000,
    });

    ctx.prisma.petFriendProfile.findUnique.mockResolvedValue(preUpgradeProfile);

    // After incrementEarnings, totalBookings becomes 20, resolveCommissionRate => 0.10
    const updatedProfile = {
      ...preUpgradeProfile,
      totalBookings: 20,
      commissionRate: 0.10,
      pendingBalanceEgp: 627,  // 500 + 127 net
      totalEarnedEgp: 2127,
    };
    ctx.prisma.petFriendProfile.update.mockResolvedValue(updatedProfile);

    const result = await petFriendService.incrementEarnings(profileId, 127, bookingId);

    // Verify the update was called with the elite commission rate
    expect(ctx.prisma.petFriendProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: profileId },
        data: expect.objectContaining({
          commissionRate: 0.10,
          totalBookings: { increment: 1 },
          pendingBalanceEgp: { increment: 127 },
          totalEarnedEgp: { increment: 127 },
        }),
      }),
    );

    expect(result.commissionRate).toBe(0.10);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: Commission NOT upgraded at 20 bookings with 4.3 rating
  // ────────────────────────────────────────────────────────────────────────

  it('should NOT upgrade commission when rating is below 4.5 even at 20+ bookings', async () => {
    const profileId = 'standard-profile-1';
    const bookingId = 'booking-21st';

    // Profile at 20 bookings but 4.3 avgRating
    const standardProfile = createPetFriendProfile({
      id: profileId,
      userId: 'sitter-standard-1',
      totalBookings: 20,
      avgRating: 4.3,
      commissionRate: 0.15,
      pendingBalanceEgp: 600,
      totalEarnedEgp: 2400,
    });

    ctx.prisma.petFriendProfile.findUnique.mockResolvedValue(standardProfile);

    const updatedProfile = {
      ...standardProfile,
      totalBookings: 21,
      commissionRate: 0.15,  // stays at default
    };
    ctx.prisma.petFriendProfile.update.mockResolvedValue(updatedProfile);

    const result = await petFriendService.incrementEarnings(profileId, 100, bookingId);

    // Verify commission rate stays at 0.15 (not elite)
    expect(ctx.prisma.petFriendProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commissionRate: 0.15,
        }),
      }),
    );

    expect(result.commissionRate).toBe(0.15);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Paymob webhook with valid HMAC updates booking
  // ────────────────────────────────────────────────────────────────────────

  it('should update booking payment status when Paymob webhook has valid HMAC', async () => {
    const bookingId = 'booking-webhook-1';
    const transactionId = 'paymob-txn-456';

    mockPaymob.validateWebhook.mockReturnValue(true);

    // Dedup check: processedWebhookEvent.create succeeds (no duplicate)
    ctx.prisma.processedWebhookEvent.create.mockResolvedValue({
      id: 'event-1',
      eventId: transactionId,
      provider: 'paymob',
    });

    // Booking lookup returns a pending-payment booking
    const pendingPaymentBooking = createBooking({
      id: bookingId,
      paymentStatus: 'pending',
    });
    ctx.prisma.booking.findUnique.mockResolvedValue(pendingPaymentBooking);

    // The update to mark as authorized
    ctx.prisma.booking.update.mockResolvedValue({
      ...pendingPaymentBooking,
      paymentStatus: 'authorized',
      paymentReference: transactionId,
    });

    const webhookBody = {
      obj: {
        id: parseInt(transactionId.replace('paymob-txn-', ''), 10) || 456,
        success: true,
        amount_cents: 15000,
        created_at: '2026-04-29T12:00:00',
        currency: 'EGP',
        error_occured: false,
        has_parent_transaction: false,
        integration_id: 12345,
        is_3d_secure: true,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        order: { id: 99, merchant_order_id: bookingId },
        source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
      },
    };

    const result = await paymentsService.handlePaymobWebhook(webhookBody, 'valid-signature');

    expect(result).toEqual({ received: true });

    // Verify the booking was updated with authorized status
    expect(ctx.prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId },
        data: expect.objectContaining({
          paymentStatus: 'authorized',
        }),
      }),
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: Paymob webhook with invalid HMAC ignored
  // ────────────────────────────────────────────────────────────────────────

  it('should NOT update booking when Paymob webhook has invalid HMAC', async () => {
    mockPaymob.validateWebhook.mockReturnValue(false);

    const webhookBody = {
      obj: {
        id: 789,
        success: true,
        amount_cents: 15000,
        order: { id: 99, merchant_order_id: 'booking-should-not-update' },
      },
    };

    const result = await paymentsService.handlePaymobWebhook(webhookBody, 'invalid-signature');

    // Still returns received: true (Paymob retries on non-2xx)
    expect(result).toEqual({ received: true });

    // Verify NO booking update happened
    expect(ctx.prisma.booking.update).not.toHaveBeenCalled();

    // Verify NO dedup record was created
    expect(ctx.prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
  });
});
