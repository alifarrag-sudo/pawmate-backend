/**
 * Suite 4 — Medical Data Encryption (Service-level with mocked Prisma)
 *
 * Verifies that:
 *  - Consultation medical fields are encrypted before DB storage
 *  - Events emitted for consultations contain NO medical data (PDPL)
 *  - Parent consent is enforced before record creation
 *  - MedicalEncryptionService encrypt/decrypt roundtrip is correct
 *  - Decryption with the wrong key fails
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { ConsultationService } from '../../src/modules/vet/consultation.service';
import {
  MedicalEncryptionService,
  MedicalDataDecryptionError,
} from '../../src/modules/crypto/medical-encryption.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createMockPrisma,
  createEventSpy,
} from '../helpers/test-app.helper';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_KEY_A =
  'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
const TEST_KEY_B =
  'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';

const VET_PROFILE_ID = randomUUID();
const PET_ID = randomUUID();
const USER_ID = randomUUID();
const BUSINESS_ID = randomUUID();

// ── Helpers ──────────────────────────────────────────────────────────────────

function consultationDto(overrides: Record<string, unknown> = {}) {
  return {
    petId: PET_ID,
    consultationType: 'IN_CLINIC',
    chiefComplaint: 'Persistent cough for 3 days',
    findings: 'Mild upper respiratory inflammation',
    diagnosis: 'Feline upper respiratory infection',
    treatmentPlan: 'Amoxicillin 50mg BID x 10 days',
    notes: 'Recheck in 2 weeks if no improvement',
    weight: 4.2,
    temperature: 39.1,
    heartRate: 180,
    parentConsentGiven: true,
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('Suite 4 — Medical Data Encryption', () => {
  let consultationService: ConsultationService;
  let encryptionService: MedicalEncryptionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: EventEmitter2;
  let eventSpy: ReturnType<typeof createEventSpy>;

  beforeAll(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        ConsultationService,
        MedicalEncryptionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'MEDICAL_DATA_ENCRYPTION_KEY') return TEST_KEY_A;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    consultationService = module.get(ConsultationService);
    encryptionService = module.get(MedicalEncryptionService);
    events = module.get(EventEmitter2);
    eventSpy = createEventSpy(events);

    // Trigger onModuleInit to load the encryption key
    encryptionService.onModuleInit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventSpy.clear();

    // Default mock: vet profile exists and is APPROVED
    prisma.vetProfile.findUnique.mockResolvedValue({
      id: VET_PROFILE_ID,
      businessProfileId: BUSINESS_ID,
      status: 'APPROVED',
    });

    // Default mock: pet exists
    prisma.pet.findUnique.mockResolvedValue({
      id: PET_ID,
      ownerId: USER_ID,
    });

    // Default mock: audit log creation succeeds
    prisma.auditLog.create.mockResolvedValue({ id: randomUUID() });
  });

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  it('Consultation data encrypted before storage', async () => {
    const dto = consultationDto();

    const createdRecord = {
      id: randomUUID(),
      vetProfileId: VET_PROFILE_ID,
      petId: PET_ID,
      consultationType: 'IN_CLINIC',
      consultedAt: new Date(),
      encryptionVersion: 1,
      weight: dto.weight,
      temperature: dto.temperature,
      heartRate: dto.heartRate,
      followUpRequired: false,
      parentConsentGiven: true,
      parentConsentAt: new Date(),
      consentVersion: 1,
      isActive: true,
      // Encrypted fields will be set by the service
      chiefComplaintEnc: '',
      findingsEnc: '',
      diagnosisEnc: '',
      treatmentPlanEnc: '',
      notesEnc: '',
    };

    prisma.vetConsultation.create.mockImplementation(async (args: any) => {
      // Capture the data that would be stored
      return { ...createdRecord, ...args.data };
    });

    await consultationService.createConsultation(USER_ID, VET_PROFILE_ID, dto);

    // Verify prisma.vetConsultation.create was called
    expect(prisma.vetConsultation.create).toHaveBeenCalledTimes(1);

    const callArgs = prisma.vetConsultation.create.mock.calls[0][0];
    const storedData = callArgs.data;

    // Encrypted fields should contain the IV:tag:ciphertext separator
    expect(storedData.chiefComplaintEnc).toContain(':');
    expect(storedData.findingsEnc).toContain(':');
    expect(storedData.diagnosisEnc).toContain(':');
    expect(storedData.treatmentPlanEnc).toContain(':');
    expect(storedData.notesEnc).toContain(':');

    // Each encrypted field has exactly 3 parts (IV:authTag:ciphertext)
    const parts = storedData.chiefComplaintEnc.split(':');
    expect(parts).toHaveLength(3);

    // Plaintext fields should NOT be stored in the DB call
    expect(storedData.chiefComplaint).toBeUndefined();
    expect(storedData.findings).toBeUndefined();
    expect(storedData.diagnosis).toBeUndefined();
    expect(storedData.treatmentPlan).toBeUndefined();
    expect(storedData.notes).toBeUndefined();

    // Verify decrypting the stored values recovers the original plaintext
    expect(encryptionService.decrypt(storedData.chiefComplaintEnc)).toBe(
      dto.chiefComplaint,
    );
    expect(encryptionService.decrypt(storedData.findingsEnc)).toBe(
      dto.findings,
    );
    expect(encryptionService.decrypt(storedData.diagnosisEnc)).toBe(
      dto.diagnosis,
    );
    expect(encryptionService.decrypt(storedData.treatmentPlanEnc)).toBe(
      dto.treatmentPlan,
    );
    expect(encryptionService.decrypt(storedData.notesEnc)).toBe(dto.notes);
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  it('Consultation event contains NO medical data', async () => {
    const dto = consultationDto();
    const consultationId = randomUUID();

    prisma.vetConsultation.create.mockResolvedValue({
      id: consultationId,
      vetProfileId: VET_PROFILE_ID,
      petId: PET_ID,
      consultationType: 'IN_CLINIC',
      consultedAt: new Date(),
      encryptionVersion: 1,
      weight: dto.weight,
      isActive: true,
      parentConsentGiven: true,
      parentConsentAt: new Date(),
      consentVersion: 1,
      chiefComplaintEnc: 'enc-placeholder',
      findingsEnc: 'enc-placeholder',
      diagnosisEnc: 'enc-placeholder',
      treatmentPlanEnc: 'enc-placeholder',
      notesEnc: 'enc-placeholder',
    });

    await consultationService.createConsultation(USER_ID, VET_PROFILE_ID, dto);

    // Verify the event was emitted
    const emittedEvents = eventSpy.getByEvent('vet.consultation_created');
    expect(emittedEvents).toHaveLength(1);

    const payload = emittedEvents[0].payload as Record<string, unknown>;

    // Event MUST contain identifiers
    expect(payload.vetProfileId).toBe(VET_PROFILE_ID);
    expect(payload.petId).toBe(PET_ID);
    expect(payload.consultationId).toBe(consultationId);

    // Event MUST NOT contain medical data (PDPL Law 151/2020)
    expect(payload).not.toHaveProperty('chiefComplaint');
    expect(payload).not.toHaveProperty('findings');
    expect(payload).not.toHaveProperty('diagnosis');
    expect(payload).not.toHaveProperty('treatment');
    expect(payload).not.toHaveProperty('treatmentPlan');
    expect(payload).not.toHaveProperty('notes');
    expect(payload).not.toHaveProperty('chiefComplaintEnc');
    expect(payload).not.toHaveProperty('findingsEnc');
    expect(payload).not.toHaveProperty('diagnosisEnc');
    expect(payload).not.toHaveProperty('treatmentPlanEnc');
    expect(payload).not.toHaveProperty('notesEnc');
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  it('Parent consent required', async () => {
    const dto = consultationDto({ parentConsentGiven: false });

    await expect(
      consultationService.createConsultation(USER_ID, VET_PROFILE_ID, dto),
    ).rejects.toThrow(BadRequestException);

    await expect(
      consultationService.createConsultation(USER_ID, VET_PROFILE_ID, dto),
    ).rejects.toThrow(/consent/i);

    // Verify no DB write occurred
    expect(prisma.vetConsultation.create).not.toHaveBeenCalled();
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  it('Encrypt/decrypt roundtrip', () => {
    const testData = [
      'Simple text',
      'Arabic: تشخيص الحالة',
      'Special chars: <script>alert("xss")</script>',
      'Long text: ' + 'a'.repeat(5000),
      '',
    ];

    for (const plaintext of testData) {
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    }

    // Verify different IVs are generated for the same plaintext
    const samePlaintext = 'Identical medical note';
    const encrypted1 = encryptionService.encrypt(samePlaintext);
    const encrypted2 = encryptionService.encrypt(samePlaintext);

    // The full encrypted strings must differ (different random IVs)
    expect(encrypted1).not.toBe(encrypted2);

    // Extract the IVs (first part before the colon)
    const iv1 = encrypted1.split(':')[0];
    const iv2 = encrypted2.split(':')[0];
    expect(iv1).not.toBe(iv2);

    // Both must still decrypt to the same plaintext
    expect(encryptionService.decrypt(encrypted1)).toBe(samePlaintext);
    expect(encryptionService.decrypt(encrypted2)).toBe(samePlaintext);
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  it('Wrong key fails decryption', () => {
    // Encrypt with key A (the service's current key)
    const plaintext = 'Sensitive diagnosis: feline herpesvirus';
    const encrypted = encryptionService.encrypt(plaintext);

    // Create a second encryption service with key B
    const wrongKeyConfig = {
      get: (key: string) => {
        if (key === 'MEDICAL_DATA_ENCRYPTION_KEY') return TEST_KEY_B;
        return undefined;
      },
    };

    const wrongKeyService = new MedicalEncryptionService(
      wrongKeyConfig as ConfigService,
    );
    wrongKeyService.onModuleInit();

    // Decrypting with the wrong key must throw
    expect(() => wrongKeyService.decrypt(encrypted)).toThrow(
      MedicalDataDecryptionError,
    );

    // The original service can still decrypt
    expect(encryptionService.decrypt(encrypted)).toBe(plaintext);
  });
});
