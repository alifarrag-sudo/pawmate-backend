import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PricingService } from './pricing.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: {
    booking: { findUnique: jest.Mock; update: jest.Mock };
    petFriendProfile: { findUnique: jest.Mock };
    paymentTransaction: { create: jest.Mock };
  };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      booking: { findUnique: jest.fn(), update: jest.fn() },
      petFriendProfile: { findUnique: jest.fn() },
      paymentTransaction: { create: jest.fn() },
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  // ── BOARDING ────────────────────────────────────────────────

  describe('calculateBookingPrice — BOARDING', () => {
    it('3 nights × 200 EGP = 600 EGP base, no late fee at booking time', () => {
      const r = service.calculateBookingPrice({
        serviceType: 'BOARDING',
        numberOfNights: 3,
        perNightRateEgp: 200,
      });
      expect(r.base).toBe(600);
      expect(r.total).toBe(600);
      expect(r.currency).toBe('EGP');
    });

    it('rejects 0-night boarding', () => {
      expect(() =>
        service.calculateBookingPrice({
          serviceType: 'BOARDING',
          numberOfNights: 0,
          perNightRateEgp: 200,
        }),
      ).toThrow(BadRequestException);
    });

    it('accepts unusually high but valid rate (no platform cap)', () => {
      const r = service.calculateBookingPrice({
        serviceType: 'BOARDING',
        numberOfNights: 1,
        perNightRateEgp: 99_999,
      });
      expect(r.total).toBe(99_999);
    });
  });

  // ── WALKING ─────────────────────────────────────────────────

  describe('calculateBookingPrice — WALKING', () => {
    it('2 hours × 80 EGP = 160 EGP', () => {
      const r = service.calculateBookingPrice({
        serviceType: 'WALKING',
        numberOfHours: 2,
        perHourRateEgp: 80,
      });
      expect(r.base).toBe(160);
      expect(r.total).toBe(160);
    });

    it('enforces minimum 1 hour', () => {
      expect(() =>
        service.calculateBookingPrice({
          serviceType: 'WALKING',
          numberOfHours: 0,
          perHourRateEgp: 80,
        }),
      ).toThrow(BadRequestException);
    });

    it('respects custom minimumHours (e.g. provider sets 2-hour min)', () => {
      expect(() =>
        service.calculateBookingPrice({
          serviceType: 'WALKING',
          numberOfHours: 1,
          perHourRateEgp: 80,
          minimumHours: 2,
        }),
      ).toThrow(BadRequestException);
    });
  });

  // ── DAY_CARE ────────────────────────────────────────────────

  describe('calculateBookingPrice — DAY_CARE', () => {
    it('SIX_HOUR session = sixHourRateEgp', () => {
      const r = service.calculateBookingPrice({
        serviceType: 'DAY_CARE',
        sessionType: 'SIX_HOUR',
        sixHourRateEgp: 300,
        eightHourRateEgp: 400,
      });
      expect(r.base).toBe(300);
      expect(r.total).toBe(300);
    });

    it('EIGHT_HOUR session = eightHourRateEgp', () => {
      const r = service.calculateBookingPrice({
        serviceType: 'DAY_CARE',
        sessionType: 'EIGHT_HOUR',
        sixHourRateEgp: 300,
        eightHourRateEgp: 400,
      });
      expect(r.base).toBe(400);
    });
  });

  // ── Rate validation ─────────────────────────────────────────

  describe('validateRate', () => {
    it('rejects 0', () => {
      expect(() => service.validateRate(0)).toThrow(BadRequestException);
    });
    it('rejects negative', () => {
      expect(() => service.validateRate(-5)).toThrow(BadRequestException);
    });
    it('rejects > 99,999', () => {
      expect(() => service.validateRate(100_000)).toThrow(BadRequestException);
    });
    it('rejects non-integer', () => {
      expect(() => service.validateRate(50.5)).toThrow(BadRequestException);
    });
    it('accepts 1 EGP (no minimum floor beyond positivity)', () => {
      expect(() => service.validateRate(1)).not.toThrow();
    });
    it('accepts 99,999 EGP (ceiling)', () => {
      expect(() => service.validateRate(99_999)).not.toThrow();
    });
  });

  // ── Late pickup fees ────────────────────────────────────────

  describe('calculateLatePickupFee — BOARDING', () => {
    const checkout = new Date('2026-05-10T00:00:00.000Z'); // calendar day
    // Boarding cutoff = 14:00 Cairo = 12:00 UTC on the same day

    it('returns 0 fee when pickup is before 2pm', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: 50,
      });
      const result = await service.calculateLatePickupFee(
        'b1',
        new Date('2026-05-10T11:00:00.000Z'), // 13:00 Cairo, before cutoff
      );
      expect(result).toEqual({ hoursLate: 0, fee: 0 });
    });

    it('2 hours late × 50 EGP = 100 EGP', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: 50,
      });
      const result = await service.calculateLatePickupFee(
        'b1',
        new Date('2026-05-10T14:00:00.000Z'), // 16:00 Cairo, 2h after cutoff
      );
      expect(result).toEqual({ hoursLate: 2, fee: 100 });
    });

    it('partial hour rounds up (Math.ceil)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: 50,
      });
      const result = await service.calculateLatePickupFee(
        'b1',
        new Date('2026-05-10T13:30:00.000Z'), // 15:30 Cairo, 1.5h late → ceils to 2
      );
      expect(result.hoursLate).toBe(2);
      expect(result.fee).toBe(100);
    });

    it('returns 0 when provider has no late-pickup rate set', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: null,
      });
      const result = await service.calculateLatePickupFee(
        'b1',
        new Date('2026-05-10T16:00:00.000Z'),
      );
      expect(result).toEqual({ hoursLate: 0, fee: 0 });
    });
  });

  describe('calculateLatePickupFee — DAY_CARE', () => {
    it('1.5 hours late ceils to 2 × 60 EGP = 120 EGP', async () => {
      const sessionEnd = new Date('2026-05-10T16:00:00.000Z');
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b2',
        serviceType: 'DAY_CARE',
        checkoutDate: null,
        sessionEndTime: sessionEnd,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        daycareLatePickupHourlyEgp: 60,
      });
      const result = await service.calculateLatePickupFee(
        'b2',
        new Date('2026-05-10T17:30:00.000Z'),
      );
      expect(result).toEqual({ hoursLate: 2, fee: 120 });
    });

    it('returns 0 when on time', async () => {
      const sessionEnd = new Date('2026-05-10T16:00:00.000Z');
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b2',
        serviceType: 'DAY_CARE',
        checkoutDate: null,
        sessionEndTime: sessionEnd,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        daycareLatePickupHourlyEgp: 60,
      });
      const result = await service.calculateLatePickupFee(
        'b2',
        new Date('2026-05-10T15:00:00.000Z'),
      );
      expect(result).toEqual({ hoursLate: 0, fee: 0 });
    });
  });

  describe('calculateLatePickupFee — non-applicable service types', () => {
    it('returns 0 for WALKING (no late fee on walk bookings)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b3',
        serviceType: 'WALKING',
        checkoutDate: null,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      const result = await service.calculateLatePickupFee('b3', new Date());
      expect(result).toEqual({ hoursLate: 0, fee: 0 });
    });

    it('throws NotFound for unknown booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.calculateLatePickupFee('missing', new Date()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordPickup', () => {
    it('persists actualPickupTime + lateFeeEgp + lateFeeHours, creates PaymentTransaction, emits event', async () => {
      const checkout = new Date('2026-05-10T00:00:00.000Z');
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: 50,
      });
      prisma.booking.update.mockResolvedValue({
        id: 'b1',
        parentId: 'parent1',
        petFriendId: 'pf1',
        paymentMethod: 'card',
      });

      const pickup = new Date('2026-05-10T15:00:00.000Z'); // 17:00 Cairo, 3h late
      const result = await service.recordPickup('b1', pickup);

      expect(result).toEqual({ hoursLate: 3, fee: 150, charged: true });

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: {
          actualPickupTime: pickup,
          lateFeeHours: 3,
          lateFeeEgp: 150,
        },
        select: { id: true, parentId: true, petFriendId: true, paymentMethod: true },
      });

      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'parent1',
          bookingId: 'b1',
          type: 'late_fee',
          amount: 150,
          direction: 'debit',
          status: 'pending',
          gateway: 'card',
        }),
      });

      expect(emitter.emit).toHaveBeenCalledWith(
        'booking.late_pickup_charged',
        expect.objectContaining({
          bookingId: 'b1',
          parentId: 'parent1',
          petFriendId: 'pf1',
          lateFeeEgp: 150,
          hoursLate: 3,
        }),
      );
    });

    it('does NOT create a PaymentTransaction or emit when fee is 0 (on-time pickup)', async () => {
      const checkout = new Date('2026-05-10T00:00:00.000Z');
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        serviceType: 'BOARDING',
        checkoutDate: checkout,
        sessionEndTime: null,
        petFriendId: 'pf1',
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue({
        boardingLatePickupHourlyEgp: 50,
      });
      prisma.booking.update.mockResolvedValue({
        id: 'b1',
        parentId: 'parent1',
        petFriendId: 'pf1',
        paymentMethod: 'card',
      });

      const pickup = new Date('2026-05-10T11:00:00.000Z'); // 13:00 Cairo, on time
      const result = await service.recordPickup('b1', pickup);

      expect(result).toEqual({ hoursLate: 0, fee: 0, charged: false });
      expect(prisma.paymentTransaction.create).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });
});
