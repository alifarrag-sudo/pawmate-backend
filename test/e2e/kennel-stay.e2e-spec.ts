/**
 * Suite 6 — Kennel Stay Lifecycle (Service-level with mocked Prisma)
 *
 * Verifies that:
 *  - Full kennel stay lifecycle: intake -> daily log -> discharge
 *  - Medical hold transitions status from IN_STAY to MEDICAL_HOLD
 *  - Availability decrements when stays overlap a date range
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';

import { KennelService } from '../../src/modules/kennel/kennel.service';
import { WaiverService } from '../../src/modules/kennel/waiver.service';
import { VaccinationCheckService } from '../../src/modules/kennel/vaccination-check.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createMockPrisma,
  createEventSpy,
} from '../helpers/test-app.helper';

// ── Constants ────────────────────────────────────────────────────────────────

const USER_ID = randomUUID();
const KENNEL_PROFILE_ID = randomUUID();
const BUSINESS_ID = randomUUID();
const BOOKING_ID = randomUUID();
const UNIT_ID = randomUUID();
const STAY_ID = randomUUID();
const PET_ID = randomUUID();

function mockKennelProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: KENNEL_PROFILE_ID,
    businessProfileId: BUSINESS_ID,
    totalUnits: 10,
    status: 'APPROVED',
    pricePerNightEgp: 200,
    requiresVaccinationProof: true,
    requiresDewormingProof: false,
    requiresHealthCertificate: false,
    liabilityWaiverText: 'Waiver text here...',
    liabilityWaiverVersion: 1,
    ...overrides,
  };
}

function mockKennelUnit(overrides: Record<string, unknown> = {}) {
  return {
    id: UNIT_ID,
    kennelProfileId: KENNEL_PROFILE_ID,
    unitNumber: 'A1',
    unitType: 'STANDARD',
    isActive: true,
    inMaintenanceUntil: null,
    maxOccupancy: 1,
    ...overrides,
  };
}

function mockKennelStay(overrides: Record<string, unknown> = {}) {
  return {
    id: STAY_ID,
    kennelProfileId: KENNEL_PROFILE_ID,
    bookingId: BOOKING_ID,
    petId: PET_ID,
    status: 'CONFIRMED',
    checkInAt: new Date('2026-05-01'),
    expectedCheckOutAt: new Date('2026-05-05'),
    actualCheckOutAt: null,
    liabilityWaiverSignatureUrl: 'https://example.com/sig.png',
    liabilityWaiverSignedAt: new Date(),
    liabilityWaiverVersion: 1,
    dailyUpdatesJson: [],
    ...overrides,
  };
}

function mockTeamMember() {
  return {
    userId: USER_ID,
    businessId: BUSINESS_ID,
    role: 'OWNER',
    status: 'ACTIVE',
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('Suite 6 — Kennel Stay Lifecycle', () => {
  let kennelService: KennelService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: EventEmitter2;
  let eventSpy: ReturnType<typeof createEventSpy>;

  beforeAll(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        KennelService,
        WaiverService,
        VaccinationCheckService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    kennelService = module.get(KennelService);
    events = module.get(EventEmitter2);
    eventSpy = createEventSpy(events);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventSpy.clear();
  });

  // ── Shared helper for team member assertion ─────────────────────────────

  function setupTeamMemberMocks() {
    // assertKennelTeamMember resolves the kennel profile and then the team member
    prisma.kennelProfile.findUnique.mockResolvedValue(
      mockKennelProfile(),
    );
    prisma.teamMember.findUnique.mockResolvedValue(mockTeamMember());
  }

  // ── Test 1: Complete kennel stay lifecycle ─────────────────────────────────

  describe('Complete kennel stay lifecycle', () => {
    it('performs intake -> daily log -> discharge', async () => {
      // ── Phase 1: Intake ──────────────────────────────────────────────

      setupTeamMemberMocks();

      const confirmedStay = mockKennelStay({ status: 'CONFIRMED' });

      prisma.kennelStay.findUnique.mockResolvedValue({
        ...confirmedStay,
        booking: { id: BOOKING_ID },
      });

      prisma.kennelUnit.findUnique.mockResolvedValue(mockKennelUnit());

      const inStay = {
        ...confirmedStay,
        status: 'IN_STAY',
        kennelUnitId: UNIT_ID,
        actualCheckInAt: new Date(),
        intakeWeight: 12.5,
        intakePhotos: ['https://cdn.example.com/intake1.jpg'],
        intakeNotes: 'Healthy, energetic',
        intakeDoneBy: USER_ID,
        intakeDoneAt: new Date(),
      };

      prisma.kennelStay.update.mockResolvedValue(inStay);

      const intakeResult = await kennelService.performIntake(
        USER_ID,
        KENNEL_PROFILE_ID,
        {
          bookingId: BOOKING_ID,
          unitId: UNIT_ID,
          intakeWeight: 12.5,
          intakePhotos: ['https://cdn.example.com/intake1.jpg'],
          intakeNotes: 'Healthy, energetic',
          vaccinationDocs: ['https://cdn.example.com/vax.pdf'],
        },
      );

      expect(intakeResult.status).toBe('IN_STAY');
      expect(intakeResult.kennelUnitId).toBe(UNIT_ID);
      expect(eventSpy.hasEvent('kennel.pet_checked_in')).toBe(true);

      // ── Phase 2: Daily Log ───────────────────────────────────────────

      jest.clearAllMocks();
      eventSpy.clear();

      const activeStay = mockKennelStay({
        status: 'IN_STAY',
        dailyUpdatesJson: [],
      });

      prisma.kennelStay.findUnique.mockResolvedValue(activeStay);
      setupTeamMemberMocks();

      const stayWithLog = {
        ...activeStay,
        dailyUpdatesJson: [
          {
            date: new Date().toISOString().split('T')[0],
            mood: 'happy',
            appetite: 'good',
            exerciseMinutes: 45,
            notes: 'Played well with other dogs',
            photoUrls: ['https://cdn.example.com/day1.jpg'],
            loggedBy: USER_ID,
          },
        ],
      };

      prisma.kennelStay.update.mockResolvedValue(stayWithLog);

      const logResult = await kennelService.addDailyLog(
        USER_ID,
        STAY_ID,
        {
          mood: 'happy',
          appetite: 'good',
          exerciseMinutes: 45,
          notes: 'Played well with other dogs',
          photoUrls: ['https://cdn.example.com/day1.jpg'],
        },
      );

      expect(logResult.dailyUpdatesJson).toHaveLength(1);
      expect(eventSpy.hasEvent('kennel.daily_update_posted')).toBe(true);

      // Verify the update call appends the log
      const updateCallData = prisma.kennelStay.update.mock.calls[0][0].data;
      expect(updateCallData.dailyUpdatesJson).toHaveLength(1);
      expect(updateCallData.dailyUpdatesJson[0].mood).toBe('happy');

      // ── Phase 3: Discharge ───────────────────────────────────────────

      jest.clearAllMocks();
      eventSpy.clear();

      const stayForDischarge = mockKennelStay({ status: 'IN_STAY' });
      prisma.kennelStay.findUnique.mockResolvedValue(stayForDischarge);
      setupTeamMemberMocks();

      const dischargedStay = {
        ...stayForDischarge,
        status: 'DISCHARGED',
        actualCheckOutAt: new Date(),
        dischargeWeight: 12.3,
        dischargePhotos: ['https://cdn.example.com/discharge1.jpg'],
        dischargeNotes: 'Healthy, returned to owner',
        dischargeDoneBy: USER_ID,
        dischargeDoneAt: new Date(),
      };

      prisma.kennelStay.update.mockResolvedValue(dischargedStay);

      const dischargeResult = await kennelService.discharge(
        USER_ID,
        STAY_ID,
        {
          dischargeWeight: 12.3,
          dischargePhotos: ['https://cdn.example.com/discharge1.jpg'],
          dischargeNotes: 'Healthy, returned to owner',
        },
      );

      expect(dischargeResult.status).toBe('DISCHARGED');
      expect(dischargeResult.actualCheckOutAt).toBeDefined();
      expect(eventSpy.hasEvent('kennel.pet_discharged')).toBe(true);

      // Verify all three lifecycle events fired across the full flow
      // (we cleared between phases, so just check the last one)
      const dischargeEvent = eventSpy.getByEvent('kennel.pet_discharged');
      expect(dischargeEvent).toHaveLength(1);
      expect((dischargeEvent[0].payload as any).stayId).toBe(STAY_ID);
    });
  });

  // ── Test 2: Medical hold changes status ───────────────────────────────────

  describe('Medical hold changes status', () => {
    it('transitions IN_STAY to MEDICAL_HOLD', async () => {
      const activeStay = mockKennelStay({ status: 'IN_STAY' });
      prisma.kennelStay.findUnique.mockResolvedValue(activeStay);
      setupTeamMemberMocks();

      const heldStay = { ...activeStay, status: 'MEDICAL_HOLD' };
      prisma.kennelStay.update.mockResolvedValue(heldStay);

      const result = await kennelService.initiateMedicalHold(
        USER_ID,
        STAY_ID,
        {
          reason: 'Vomiting and lethargy observed',
          vetContact: '+20100123456',
        },
      );

      expect(result.status).toBe('MEDICAL_HOLD');

      // Verify the update call set the correct status
      const updateCall = prisma.kennelStay.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('MEDICAL_HOLD');

      // Verify the event was emitted with medical context
      expect(eventSpy.hasEvent('kennel.medical_hold_initiated')).toBe(true);
      const holdEvent = eventSpy.getByEvent('kennel.medical_hold_initiated')[0];
      const payload = holdEvent.payload as Record<string, unknown>;
      expect(payload.reason).toBe('Vomiting and lethargy observed');
      expect(payload.vetContact).toBe('+20100123456');
      expect(payload.stayId).toBe(STAY_ID);
    });

    it('rejects medical hold on non-IN_STAY status', async () => {
      const dischargedStay = mockKennelStay({ status: 'DISCHARGED' });
      prisma.kennelStay.findUnique.mockResolvedValue(dischargedStay);
      setupTeamMemberMocks();

      await expect(
        kennelService.initiateMedicalHold(USER_ID, STAY_ID, {
          reason: 'Some reason',
          vetContact: '+20100123456',
        }),
      ).rejects.toThrow(/active stays/i);

      expect(prisma.kennelStay.update).not.toHaveBeenCalled();
    });
  });

  // ── Test 3: Availability decrements on booking ────────────────────────────

  describe('Availability decrements on booking', () => {
    it('reduces available count when stays overlap the queried range', async () => {
      const kennel = mockKennelProfile({ totalUnits: 5 });
      prisma.kennelProfile.findUnique.mockResolvedValue(kennel);

      // 3 overlapping stays for 2026-05-01 to 2026-05-04
      const overlappingStays = [
        {
          checkInAt: new Date('2026-04-30'),
          expectedCheckOutAt: new Date('2026-05-03'),
          actualCheckOutAt: null,
        },
        {
          checkInAt: new Date('2026-05-01'),
          expectedCheckOutAt: new Date('2026-05-05'),
          actualCheckOutAt: null,
        },
        {
          checkInAt: new Date('2026-05-02'),
          expectedCheckOutAt: new Date('2026-05-04'),
          actualCheckOutAt: null,
        },
      ];

      prisma.kennelStay.findMany.mockResolvedValue(overlappingStays);

      // 1 unit under maintenance
      prisma.kennelUnit.count.mockResolvedValue(1);

      const availability = await kennelService.getAvailability(
        KENNEL_PROFILE_ID,
        '2026-05-01',
        '2026-05-04',
      );

      // Should return 3 dates (May 1, 2, 3)
      expect(availability).toHaveLength(3);

      // May 1: stays 1 and 2 overlap + 1 maintenance = 5 - 2 - 1 = 2 available
      const may1 = availability.find((d) => d.date === '2026-05-01');
      expect(may1).toBeDefined();
      expect(may1!.totalUnits).toBe(5);
      expect(may1!.bookedUnits).toBe(2);
      expect(may1!.maintenanceUnits).toBe(1);
      expect(may1!.availableUnits).toBe(2);

      // May 2: all 3 stays overlap + 1 maintenance = 5 - 3 - 1 = 1 available
      const may2 = availability.find((d) => d.date === '2026-05-02');
      expect(may2).toBeDefined();
      expect(may2!.bookedUnits).toBe(3);
      expect(may2!.availableUnits).toBe(1);

      // May 3: stays 2 and 3 overlap + 1 maintenance = 5 - 2 - 1 = 2 available
      // (stay 1 ends on May 3 but expectedCheckOutAt > current means it's included
      //  only if checkInAt <= current AND effectiveEnd > current.
      //  Stay 1: checkInAt=Apr30 <= May3, effectiveEnd=May3 > May3? No, May3 is NOT > May3.
      //  So stay 1 is NOT counted on May 3.)
      // Stay 2: checkInAt=May1 <= May3, effectiveEnd=May5 > May3? Yes.
      // Stay 3: checkInAt=May2 <= May3, effectiveEnd=May4 > May3? Yes.
      const may3 = availability.find((d) => d.date === '2026-05-03');
      expect(may3).toBeDefined();
      expect(may3!.bookedUnits).toBe(2);
      expect(may3!.availableUnits).toBe(2);
    });

    it('returns full capacity when no stays overlap', async () => {
      const kennel = mockKennelProfile({ totalUnits: 8 });
      prisma.kennelProfile.findUnique.mockResolvedValue(kennel);

      prisma.kennelStay.findMany.mockResolvedValue([]);
      prisma.kennelUnit.count.mockResolvedValue(0);

      const availability = await kennelService.getAvailability(
        KENNEL_PROFILE_ID,
        '2026-06-01',
        '2026-06-03',
      );

      expect(availability).toHaveLength(2);

      for (const day of availability) {
        expect(day.totalUnits).toBe(8);
        expect(day.bookedUnits).toBe(0);
        expect(day.maintenanceUnits).toBe(0);
        expect(day.availableUnits).toBe(8);
      }
    });

    it('clamps available units to zero when overbooked', async () => {
      const kennel = mockKennelProfile({ totalUnits: 2 });
      prisma.kennelProfile.findUnique.mockResolvedValue(kennel);

      // 3 stays on a 2-unit kennel
      const stays = [
        {
          checkInAt: new Date('2026-07-01'),
          expectedCheckOutAt: new Date('2026-07-03'),
          actualCheckOutAt: null,
        },
        {
          checkInAt: new Date('2026-07-01'),
          expectedCheckOutAt: new Date('2026-07-03'),
          actualCheckOutAt: null,
        },
        {
          checkInAt: new Date('2026-07-01'),
          expectedCheckOutAt: new Date('2026-07-03'),
          actualCheckOutAt: null,
        },
      ];

      prisma.kennelStay.findMany.mockResolvedValue(stays);
      prisma.kennelUnit.count.mockResolvedValue(0);

      const availability = await kennelService.getAvailability(
        KENNEL_PROFILE_ID,
        '2026-07-01',
        '2026-07-02',
      );

      // Math.max(0, 2 - 3 - 0) = 0
      expect(availability[0].availableUnits).toBe(0);
      expect(availability[0].bookedUnits).toBe(3);
    });
  });
});
