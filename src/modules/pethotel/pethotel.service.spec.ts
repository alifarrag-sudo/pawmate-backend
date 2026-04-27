import { Test, TestingModule } from '@nestjs/testing';
import { PetHotelService } from './pethotel.service';
import { DepositService } from './deposit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('PetHotelService', () => {
  let service: PetHotelService;
  let depositService: DepositService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  const mockBusiness = {
    id: 'biz-1',
    ownerId: mockUserId,
    businessType: 'PET_HOTEL',
    businessName: 'The Pawlace',
    status: 'APPROVED',
  };

  const mockHotelProfile = {
    id: 'hotel-1',
    businessProfileId: 'biz-1',
    hotelName: 'The Pawlace',
    starRating: 4,
    acceptsDogs: true,
    acceptsCats: true,
    maxPetsPerRoom: 1,
    hasPool: true,
    hasGroomingSpa: true,
    hasLiveCameraAccess: true,
    hasOnCallVet: false,
    depositPercentage: 25,
    depositRefundWindowHours: 72,
    requiresVaccinationProof: true,
    requiredVaccines: ['rabies', 'DHPP'],
    liabilityWaiverText: 'By signing, you acknowledge...',
    liabilityWaiverVersion: 1,
    status: 'PENDING_DOCS',
    checkInWindowJson: { earliest: '10:00', latest: '18:00' },
    checkOutWindowJson: { earliest: '08:00', latest: '12:00' },
  };

  const mockTeamMember = {
    id: 'tm-1',
    businessId: 'biz-1',
    userId: mockUserId,
    role: 'OWNER',
    status: 'ACTIVE',
    business: {
      ...mockBusiness,
      petHotelProfile: mockHotelProfile,
    },
  };

  beforeEach(async () => {
    prisma = {
      petHotelProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      petHotelRoomType: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      petHotelRoom: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      petHotelPackage: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      petHotelStay: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetHotelService,
        DepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<PetHotelService>(PetHotelService);
    depositService = module.get<DepositService>(DepositService);
  });

  function setupOwnerAuth(overrides?: Partial<typeof mockTeamMember>) {
    prisma.teamMember.findFirst.mockResolvedValue({
      ...mockTeamMember,
      ...overrides,
    });
  }

  function setupTeamMemberAuth(hotelProfileId = 'hotel-1') {
    prisma.petHotelProfile.findUnique.mockResolvedValue({
      id: hotelProfileId,
      businessProfileId: 'biz-1',
    });
    prisma.teamMember.findUnique.mockResolvedValue({
      id: 'tm-1',
      businessId: 'biz-1',
      userId: mockUserId,
      role: 'PROVIDER',
      status: 'ACTIVE',
    });
  }

  // ── Test: Application without rooms stays PENDING_DOCS ──────────────────────

  describe('applyForPetHotel', () => {
    it('should remain PENDING_DOCS when no rooms are created', async () => {
      setupOwnerAuth({
        business: { ...mockBusiness, petHotelProfile: null },
      } as any);
      prisma.petHotelProfile.findUnique.mockResolvedValue(null);
      prisma.petHotelProfile.create.mockResolvedValue({
        ...mockHotelProfile,
        status: 'PENDING_DOCS',
      });

      const result = await service.applyForPetHotel(mockUserId, {
        hotelName: 'The Pawlace',
        starRating: 4,
        checkInWindowJson: { earliest: '10:00', latest: '18:00' },
        checkOutWindowJson: { earliest: '08:00', latest: '12:00' },
      });

      expect(result.status).toBe('PENDING_DOCS');
      expect(events.emit).toHaveBeenCalledWith('pethotel.applied', expect.any(Object));
      expect(events.emit).not.toHaveBeenCalledWith('pethotel.auto_approved', expect.any(Object));
    });

    it('should reject if business type is not PET_HOTEL', async () => {
      setupOwnerAuth({
        business: { ...mockBusiness, businessType: 'KENNEL', petHotelProfile: null },
      } as any);

      await expect(
        service.applyForPetHotel(mockUserId, {
          checkInWindowJson: { earliest: '10:00', latest: '18:00' },
          checkOutWindowJson: { earliest: '08:00', latest: '12:00' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Test: Deposit calculation ───────────────────────────────────────────────

  describe('DepositService', () => {
    it('should calculate 25% of 2000 EGP stay = 500 EGP deposit', () => {
      const result = depositService.calculateDeposit(2000, 25);
      expect(result.deposit).toBe(500);
      expect(result.balance).toBe(1500);
    });

    it('should ceil deposit for fractional amounts', () => {
      const result = depositService.calculateDeposit(999, 25);
      expect(result.deposit).toBe(250); // ceil(249.75) = 250
      expect(result.balance).toBe(749);
    });

    it('should calculate stay cost with regular pricing', () => {
      const cost = depositService.calculateStayCost(5, 200, 7, 150);
      expect(cost).toBe(1000); // 5 nights * 200 (below long-stay threshold)
    });

    it('should calculate stay cost with long-stay pricing', () => {
      const cost = depositService.calculateStayCost(10, 200, 7, 150);
      expect(cost).toBe(1500); // 10 nights * 150 (above long-stay threshold)
    });

    it('should use regular pricing when no long-stay rate', () => {
      const cost = depositService.calculateStayCost(10, 200, 7, null);
      expect(cost).toBe(2000); // 10 nights * 200
    });
  });

  // ── Test: Cancellation before window = full refund ──────────────────────────

  describe('cancellation refund logic', () => {
    it('should return true for cancellation before refund window', () => {
      const cancelledAt = new Date('2026-05-01T10:00:00Z');
      const checkInDate = new Date('2026-05-05T10:00:00Z'); // 96 hours later
      const isRefundable = depositService.isWithinRefundWindow(cancelledAt, checkInDate, 72);
      expect(isRefundable).toBe(true);
    });

    it('should return false for cancellation after refund window', () => {
      const cancelledAt = new Date('2026-05-04T10:00:00Z');
      const checkInDate = new Date('2026-05-05T10:00:00Z'); // 24 hours later
      const isRefundable = depositService.isWithinRefundWindow(cancelledAt, checkInDate, 72);
      expect(isRefundable).toBe(false);
    });
  });

  // ── Test: Availability query returns correct tier counts ────────────────────

  describe('getAvailability', () => {
    it('should return per-room-type availability counts', async () => {
      const roomTypes = [
        {
          id: 'rt-1',
          name: 'Standard',
          tier: 'STANDARD',
          pricePerNightEgp: 200,
          longStayPricePerNightEgp: null,
          amenities: [],
          rooms: [
            { id: 'r-1', isActive: true, inMaintenanceUntil: null },
            { id: 'r-2', isActive: true, inMaintenanceUntil: null },
          ],
        },
        {
          id: 'rt-2',
          name: 'Suite',
          tier: 'SUITE',
          pricePerNightEgp: 500,
          longStayPricePerNightEgp: 400,
          amenities: ['live_camera', 'private_play'],
          rooms: [
            { id: 'r-3', isActive: true, inMaintenanceUntil: null },
          ],
        },
      ];

      prisma.petHotelRoomType.findMany.mockResolvedValue(roomTypes);
      prisma.petHotelStay.findMany.mockResolvedValue([
        { petHotelRoomId: 'r-1' }, // room r-1 occupied
      ]);

      const result = await service.getAvailability('hotel-1', '2026-05-01', '2026-05-03');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        roomTypeId: 'rt-1',
        name: 'Standard',
        tier: 'STANDARD',
        pricePerNightEgp: 200,
        longStayPricePerNightEgp: null,
        amenities: [],
        totalRooms: 2,
        availableRooms: 1, // 2 total - 1 occupied
      });
      expect(result[1]).toEqual({
        roomTypeId: 'rt-2',
        name: 'Suite',
        tier: 'SUITE',
        pricePerNightEgp: 500,
        longStayPricePerNightEgp: 400,
        amenities: ['live_camera', 'private_play'],
        totalRooms: 1,
        availableRooms: 1, // not occupied
      });
    });
  });

  // ── Test: Balance payment unlocks IN_STAY status ────────────────────────────

  describe('payBalance', () => {
    it('should update balance status and emit event', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'DEPOSIT_PAID',
        balanceAmountEgp: 1500,
        booking: { parentId: mockUserId },
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        status: 'BALANCE_DUE',
        balancePaidAt: expect.any(Date),
      });

      const result = await service.payBalance(mockUserId, 'stay-1', {
        paymentReference: 'paymob-ref-123',
      });

      expect(result.status).toBe('BALANCE_DUE');
      expect(events.emit).toHaveBeenCalledWith('pethotel.balance_paid', expect.any(Object));
    });

    it('should reject if not the parent of the booking', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'DEPOSIT_PAID',
        booking: { parentId: 'other-user' },
      });

      await expect(
        service.payBalance(mockUserId, 'stay-1', { paymentReference: 'ref' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Test: Package booking tracks services correctly ─────────────────────────

  describe('addService', () => {
    it('should increment grooming sessions done', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        petHotelProfileId: 'hotel-1',
        groomingSessionsDone: 1,
        trainingSessionsDone: 0,
        vetCheckupDone: false,
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        groomingSessionsDone: 2,
      });

      const result = await service.addService(mockUserId, 'stay-1', { type: 'grooming' });
      expect(result.groomingSessionsDone).toBe(2);
    });

    it('should mark vet checkup as done', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        petHotelProfileId: 'hotel-1',
        groomingSessionsDone: 0,
        trainingSessionsDone: 0,
        vetCheckupDone: false,
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        vetCheckupDone: true,
      });

      const result = await service.addService(mockUserId, 'stay-1', { type: 'vet_checkup' });
      expect(result.vetCheckupDone).toBe(true);
    });
  });

  // ── Test: Extend stay creates approval request ──────────────────────────────

  describe('requestExtension', () => {
    it('should update checkout date', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        petHotelProfileId: 'hotel-1',
        checkOutDate: new Date('2026-05-05'),
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        checkOutDate: new Date('2026-05-08'),
      });

      const result = await service.requestExtension(mockUserId, 'stay-1', {
        newCheckOutDate: '2026-05-08',
      });

      expect(new Date(result.checkOutDate).toISOString()).toContain('2026-05-08');
    });

    it('should reject extension for non-active stays', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'CHECKED_OUT',
        petHotelProfileId: 'hotel-1',
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      await expect(
        service.requestExtension(mockUserId, 'stay-1', { newCheckOutDate: '2026-05-08' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Test: Medical hold ──────────────────────────────────────────────────────

  describe('initiateMedicalHold', () => {
    it('should set status to MEDICAL_HOLD and emit event', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        petHotelProfileId: 'hotel-1',
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        status: 'MEDICAL_HOLD',
      });

      const result = await service.initiateMedicalHold(mockUserId, 'stay-1', {
        reason: 'Pet showing signs of illness',
      });

      expect(result.status).toBe('MEDICAL_HOLD');
      expect(events.emit).toHaveBeenCalledWith(
        'pethotel.medical_hold_initiated',
        expect.objectContaining({
          stayId: 'stay-1',
          reason: 'Pet showing signs of illness',
        }),
      );
    });
  });

  // ── Test: Discharge ─────────────────────────────────────────────────────────

  describe('discharge', () => {
    it('should set status to CHECKED_OUT and emit event', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        petHotelProfileId: 'hotel-1',
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      prisma.petHotelStay.update.mockResolvedValue({
        id: 'stay-1',
        status: 'CHECKED_OUT',
        actualCheckOutAt: expect.any(Date),
      });

      const result = await service.discharge(mockUserId, 'stay-1', {
        dischargeWeight: 12.5,
        dischargePhotos: ['https://cdn.test/discharge.jpg'],
        dischargeNotes: 'Healthy and happy',
      });

      expect(result.status).toBe('CHECKED_OUT');
      expect(events.emit).toHaveBeenCalledWith(
        'pethotel.pet_checked_out',
        expect.objectContaining({ stayId: 'stay-1' }),
      );
    });

    it('should reject discharge for non-active stays', async () => {
      prisma.petHotelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        status: 'DEPOSIT_PAID',
        petHotelProfileId: 'hotel-1',
      });

      setupTeamMemberAuth();
      prisma.petHotelProfile.findUnique.mockReset();
      prisma.petHotelProfile.findUnique.mockResolvedValue({
        id: 'hotel-1',
        businessProfileId: 'biz-1',
      });

      await expect(
        service.discharge(mockUserId, 'stay-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
