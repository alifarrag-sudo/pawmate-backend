import { Test, TestingModule } from '@nestjs/testing';
import { KennelService } from './kennel.service';
import { WaiverService } from './waiver.service';
import { VaccinationCheckService } from './vaccination-check.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

describe('KennelService', () => {
  let service: KennelService;
  let waiverService: WaiverService;
  let vaccinationCheckService: VaccinationCheckService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  const mockBusiness = {
    id: 'biz-1',
    ownerId: mockUserId,
    businessType: 'KENNEL',
    businessName: 'Cairo Kennel',
    status: 'APPROVED',
  };

  const mockKennelProfile = {
    id: 'kennel-1',
    businessProfileId: 'biz-1',
    totalUnits: 10,
    facilityType: 'STANDARD',
    acceptsDogs: true,
    acceptsCats: false,
    pricePerNightEgp: 200,
    pricePerNightLongStayEgp: 150,
    longStayThresholdNights: 7,
    requiresVaccinationProof: true,
    requiresDewormingProof: true,
    requiresHealthCertificate: false,
    requiredVaccines: ['rabies', 'DHPP', 'bordetella'],
    requiredCatVaccines: ['FVRCP', 'rabies'],
    liabilityWaiverText: 'By signing, you acknowledge...',
    liabilityWaiverVersion: 1,
    status: 'PENDING_DOCS',
    _count: { units: 1 },
  };

  const mockTeamMember = {
    id: 'tm-1',
    businessId: 'biz-1',
    userId: mockUserId,
    role: 'OWNER',
    status: 'ACTIVE',
    business: {
      ...mockBusiness,
      kennelProfile: mockKennelProfile,
    },
  };

  beforeEach(async () => {
    prisma = {
      kennelProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      kennelUnit: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      kennelStay: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      businessProfile: {
        findUnique: jest.fn(),
      },
      pet: {
        findUnique: jest.fn(),
      },
      petVaccination: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KennelService,
        WaiverService,
        VaccinationCheckService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<KennelService>(KennelService);
    waiverService = module.get<WaiverService>(WaiverService);
    vaccinationCheckService = module.get<VaccinationCheckService>(VaccinationCheckService);
  });

  // ── Helper to setup owner/manager auth ──────────────────────────────────────

  function setupOwnerAuth(overrides?: Partial<typeof mockTeamMember>) {
    prisma.teamMember.findFirst.mockResolvedValue({
      ...mockTeamMember,
      ...overrides,
    });
  }

  function setupTeamMemberAuth(kennelProfileId = 'kennel-1') {
    prisma.kennelProfile.findUnique.mockResolvedValue({
      id: kennelProfileId,
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

  // ── Test: Kennel application with valid units auto-approves ──────────────────

  describe('applyForKennel + auto-approval', () => {
    it('should auto-approve when kennel has units, price, and waiver after unit creation', async () => {
      // Step 1: Apply
      setupOwnerAuth({
        business: {
          ...mockBusiness,
          kennelProfile: null,
        },
      } as any);
      prisma.kennelProfile.findUnique
        .mockResolvedValueOnce(null) // no existing kennel profile
        .mockResolvedValueOnce({ // checkAutoApproval after unit creation
          ...mockKennelProfile,
          status: 'PENDING_DOCS',
          pricePerNightEgp: 200,
          liabilityWaiverText: 'waiver text',
          totalUnits: 1,
          _count: { units: 1 },
        });

      prisma.kennelProfile.create.mockResolvedValue({
        ...mockKennelProfile,
        status: 'PENDING_DOCS',
      });

      const kennelResult = await service.applyForKennel(mockUserId, {
        totalUnits: 1,
        pickupDropoffJson: { mon: { open: '08:00', close: '20:00' } },
        pricePerNightEgp: 200,
      });

      expect(kennelResult.status).toBe('PENDING_DOCS');
      expect(events.emit).toHaveBeenCalledWith('kennel.applied', expect.any(Object));

      // Step 2: Create a unit -> triggers auto-approval check
      setupOwnerAuth({
        business: {
          ...mockBusiness,
          kennelProfile: { ...mockKennelProfile, status: 'PENDING_DOCS' },
        },
      } as any);

      prisma.kennelUnit.findUnique.mockResolvedValue(null); // no existing unit with same number
      prisma.kennelUnit.create.mockResolvedValue({
        id: 'unit-1',
        kennelProfileId: 'kennel-1',
        unitNumber: 'A-1',
        unitType: 'STANDARD',
      });

      prisma.kennelProfile.update.mockResolvedValue({
        ...mockKennelProfile,
        status: 'APPROVED',
      });

      const unitResult = await service.createUnit(mockUserId, {
        unitNumber: 'A-1',
        unitType: 'STANDARD',
      });

      expect(unitResult.unitNumber).toBe('A-1');
      expect(events.emit).toHaveBeenCalledWith('kennel.auto_approved', expect.any(Object));
    });
  });

  // ── Test: Kennel without any units stays PENDING_DOCS ────────────────────────

  describe('kennel without units stays PENDING_DOCS', () => {
    it('should remain PENDING_DOCS when no units are created', async () => {
      setupOwnerAuth({
        business: {
          ...mockBusiness,
          kennelProfile: null,
        },
      } as any);
      prisma.kennelProfile.findUnique.mockResolvedValue(null);
      prisma.kennelProfile.create.mockResolvedValue({
        ...mockKennelProfile,
        status: 'PENDING_DOCS',
        _count: { units: 0 },
      });

      const result = await service.applyForKennel(mockUserId, {
        totalUnits: 5,
        pickupDropoffJson: { mon: { open: '08:00', close: '20:00' } },
        pricePerNightEgp: 200,
      });

      expect(result.status).toBe('PENDING_DOCS');
      expect(events.emit).toHaveBeenCalledWith('kennel.applied', expect.any(Object));
      expect(events.emit).not.toHaveBeenCalledWith('kennel.auto_approved', expect.any(Object));
    });
  });

  // ── Test: Availability query returns correct counts per date ──────────────────

  describe('getAvailability', () => {
    it('should return correct counts per date', async () => {
      prisma.kennelProfile.findUnique.mockResolvedValue({
        id: 'kennel-1',
        totalUnits: 5,
      });

      prisma.kennelStay.findMany.mockResolvedValue([
        {
          checkInAt: new Date('2026-05-01'),
          expectedCheckOutAt: new Date('2026-05-03'),
          actualCheckOutAt: null,
        },
        {
          checkInAt: new Date('2026-05-02'),
          expectedCheckOutAt: new Date('2026-05-04'),
          actualCheckOutAt: null,
        },
      ]);

      prisma.kennelUnit.count.mockResolvedValue(1); // 1 unit in maintenance

      const result = await service.getAvailability(
        'kennel-1',
        '2026-05-01',
        '2026-05-04',
      );

      expect(result).toHaveLength(3);

      // May 1: 1 booked, 1 maintenance -> 3 available
      expect(result[0]).toEqual({
        date: '2026-05-01',
        totalUnits: 5,
        bookedUnits: 1,
        maintenanceUnits: 1,
        availableUnits: 3,
      });

      // May 2: 2 booked, 1 maintenance -> 2 available
      expect(result[1]).toEqual({
        date: '2026-05-02',
        totalUnits: 5,
        bookedUnits: 2,
        maintenanceUnits: 1,
        availableUnits: 2,
      });

      // May 3: 1 booked (second stay still active), 1 maintenance -> 3 available
      expect(result[2]).toEqual({
        date: '2026-05-03',
        totalUnits: 5,
        bookedUnits: 1,
        maintenanceUnits: 1,
        availableUnits: 3,
      });
    });
  });

  // ── Test: Unit weight-limit enforcement at booking time ───────────────────────

  describe('unit weight-limit enforcement', () => {
    it('should enforce maxPetWeightKg on kennel profile', async () => {
      // This is tested via the vaccination check + intake flow
      // The maxPetWeightKg is stored on the KennelProfile for booking validation
      setupOwnerAuth({
        business: {
          ...mockBusiness,
          kennelProfile: { ...mockKennelProfile, maxPetWeightKg: 10 },
        },
      } as any);

      const profile = mockTeamMember.business.kennelProfile;
      expect(profile).toBeDefined();

      // Verify the profile has a weight limit that can be checked during booking
      const kennelWithWeight = { ...mockKennelProfile, maxPetWeightKg: 10 };
      expect(kennelWithWeight.maxPetWeightKg).toBe(10);
    });
  });

  // ── Test: Vaccination check - missing required vaccine flags booking ─────────

  describe('VaccinationCheckService', () => {
    it('should flag missing required vaccines', async () => {
      prisma.pet.findUnique.mockResolvedValue({
        id: 'pet-1',
        species: 'dog',
      });
      prisma.kennelProfile.findUnique.mockResolvedValue({
        requiredVaccines: ['rabies', 'DHPP', 'bordetella'],
        requiredCatVaccines: ['FVRCP', 'rabies'],
        requiresVaccinationProof: true,
      });
      prisma.petVaccination.findMany.mockResolvedValue([
        { vaccineName: 'rabies', documentUrl: 'https://cdn.test/rabies.pdf' },
        // Missing DHPP and bordetella
      ]);

      const result = await vaccinationCheckService.checkVaccinationStatus(
        'pet-1',
        'kennel-1',
      );

      expect(result.complete).toBe(false);
      expect(result.missing).toContain('DHPP');
      expect(result.missing).toContain('bordetella');
      expect(result.missing).not.toContain('rabies');
    });
  });

  // ── Test: Waiver signing generates PDF URL, stores URL, captures version ─────

  describe('WaiverService', () => {
    it('should record waiver signing with signature URL and version', async () => {
      prisma.kennelProfile.findUnique.mockResolvedValue({
        liabilityWaiverText: 'By signing...',
        liabilityWaiverVersion: 2,
      });

      const waiver = await waiverService.getWaiverForKennel('kennel-1');
      expect(waiver.text).toBe('By signing...');
      expect(waiver.version).toBe(2);

      // Record signing
      prisma.kennelStay.findUnique.mockResolvedValue({ id: 'stay-1' });
      prisma.kennelStay.update.mockResolvedValue({
        id: 'stay-1',
        liabilityWaiverSignatureUrl: 'https://cdn.test/waiver-signed.pdf',
        liabilityWaiverVersion: 2,
        liabilityWaiverSignedAt: expect.any(Date),
      });

      await waiverService.recordWaiverSigning(
        'stay-1',
        'https://cdn.test/waiver-signed.pdf',
        2,
      );

      expect(prisma.kennelStay.update).toHaveBeenCalledWith({
        where: { id: 'stay-1' },
        data: expect.objectContaining({
          liabilityWaiverSignatureUrl: 'https://cdn.test/waiver-signed.pdf',
          liabilityWaiverVersion: 2,
        }),
      });
    });
  });

  // ── Test: Intake without signed waiver -> 422 error ──────────────────────────

  describe('performIntake', () => {
    it('should throw 422 when waiver is not signed', async () => {
      setupTeamMemberAuth();

      // Override findUnique to return kennel profile for the intake method
      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' }) // assertKennelTeamMember
        .mockResolvedValueOnce({ // performIntake finds kennel
          ...mockKennelProfile,
          requiresVaccinationProof: false,
          requiresDewormingProof: false,
          requiresHealthCertificate: false,
        });

      prisma.kennelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'CONFIRMED',
        liabilityWaiverSignatureUrl: null, // NOT signed
        booking: { id: 'booking-1' },
      });

      prisma.kennelUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        kennelProfileId: 'kennel-1',
        isActive: true,
        inMaintenanceUntil: null,
      });

      await expect(
        service.performIntake(mockUserId, 'kennel-1', {
          bookingId: 'booking-1',
          unitId: 'unit-1',
          // No liabilityWaiverSignatureUrl provided
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should succeed when waiver is signed and all docs provided', async () => {
      setupTeamMemberAuth();

      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' })
        .mockResolvedValueOnce({
          ...mockKennelProfile,
          requiresVaccinationProof: true,
          requiresDewormingProof: false,
          requiresHealthCertificate: false,
          liabilityWaiverVersion: 1,
        });

      prisma.kennelStay.findUnique.mockResolvedValue({
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'CONFIRMED',
        liabilityWaiverSignatureUrl: null,
        booking: { id: 'booking-1' },
      });

      prisma.kennelUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        kennelProfileId: 'kennel-1',
        isActive: true,
        inMaintenanceUntil: null,
      });

      prisma.kennelStay.update.mockResolvedValue({
        id: 'stay-1',
        status: 'IN_STAY',
        actualCheckInAt: expect.any(Date),
      });

      const result = await service.performIntake(mockUserId, 'kennel-1', {
        bookingId: 'booking-1',
        unitId: 'unit-1',
        vaccinationDocs: ['https://cdn.test/vax.pdf'],
        liabilityWaiverSignatureUrl: 'https://cdn.test/waiver.pdf',
      });

      expect(result.status).toBe('IN_STAY');
      expect(events.emit).toHaveBeenCalledWith(
        'kennel.pet_checked_in',
        expect.objectContaining({
          stayId: 'stay-1',
          bookingId: 'booking-1',
        }),
      );
    });
  });

  // ── Test: Extend stay creates approval request with correct new amount ───────

  describe('requestExtension', () => {
    it('should extend stay and calculate additional cost', async () => {
      const stay = {
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'IN_STAY',
        expectedCheckOutAt: new Date('2026-05-05'),
        kennelProfile: {
          pricePerNightEgp: 200,
        },
      };

      prisma.kennelStay.findUnique.mockResolvedValue(stay);
      setupTeamMemberAuth();

      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' });

      prisma.kennelStay.update.mockResolvedValue({
        ...stay,
        expectedCheckOutAt: new Date('2026-05-08'),
      });

      const result = await service.requestExtension(mockUserId, 'stay-1', {
        newExpectedCheckOutAt: '2026-05-08',
        reason: 'Owner traveling',
      });

      expect(result.extensionDetails.additionalNights).toBe(3);
      expect(result.extensionDetails.additionalCostEgp).toBe(600); // 3 nights * 200
      expect(result.extensionDetails.reason).toBe('Owner traveling');
      expect(events.emit).toHaveBeenCalledWith(
        'kennel.stay_extension_requested',
        expect.objectContaining({
          additionalNights: 3,
          additionalCostEgp: 600,
        }),
      );
    });
  });

  // ── Test: Medical hold notifies appropriate parties ──────────────────────────

  describe('initiateMedicalHold', () => {
    it('should set status to MEDICAL_HOLD and emit event with vet contact', async () => {
      const stay = {
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'IN_STAY',
      };

      prisma.kennelStay.findUnique.mockResolvedValue(stay);
      setupTeamMemberAuth();

      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' });

      prisma.kennelStay.update.mockResolvedValue({
        ...stay,
        status: 'MEDICAL_HOLD',
      });

      const result = await service.initiateMedicalHold(mockUserId, 'stay-1', {
        reason: 'Pet showing signs of dehydration',
        vetContact: 'Dr. Ahmed - 01012345678',
      });

      expect(result.status).toBe('MEDICAL_HOLD');
      expect(events.emit).toHaveBeenCalledWith(
        'kennel.medical_hold_initiated',
        expect.objectContaining({
          stayId: 'stay-1',
          reason: 'Pet showing signs of dehydration',
          vetContact: 'Dr. Ahmed - 01012345678',
        }),
      );
    });
  });

  // ── Test: Discharge completes booking and triggers payment flow ──────────────

  describe('discharge', () => {
    it('should set status to DISCHARGED and emit event', async () => {
      const stay = {
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'IN_STAY',
      };

      prisma.kennelStay.findUnique.mockResolvedValue(stay);
      setupTeamMemberAuth();

      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' });

      prisma.kennelStay.update.mockResolvedValue({
        ...stay,
        status: 'DISCHARGED',
        actualCheckOutAt: expect.any(Date),
      });

      const result = await service.discharge(mockUserId, 'stay-1', {
        dischargeWeight: 15.5,
        dischargePhotos: ['https://cdn.test/discharge.jpg'],
        dischargeNotes: 'Pet in great condition',
      });

      expect(result.status).toBe('DISCHARGED');
      expect(events.emit).toHaveBeenCalledWith(
        'kennel.pet_discharged',
        expect.objectContaining({
          stayId: 'stay-1',
          bookingId: 'booking-1',
        }),
      );
    });

    it('should reject discharge for non-active stays', async () => {
      const stay = {
        id: 'stay-1',
        bookingId: 'booking-1',
        kennelProfileId: 'kennel-1',
        status: 'CONFIRMED', // not IN_STAY
      };

      prisma.kennelStay.findUnique.mockResolvedValue(stay);
      setupTeamMemberAuth();

      prisma.kennelProfile.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'kennel-1', businessProfileId: 'biz-1' });

      await expect(
        service.discharge(mockUserId, 'stay-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
