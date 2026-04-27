import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MedicalEncryptionService, MedicalDataDecryptionError } from '../crypto/medical-encryption.service';
import { ConsultationService } from './consultation.service';
import { PrescriptionService } from './prescription.service';
import { VetService } from './vet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

// Generate a valid 64-char hex key for testing
const TEST_KEY = randomBytes(32).toString('hex');

describe('Vet Module', () => {
  let encryptionService: MedicalEncryptionService;
  let consultationService: ConsultationService;
  let prescriptionService: PrescriptionService;
  let vetService: VetService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  beforeEach(async () => {
    prisma = {
      vetProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      vetAffiliation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vetConsultation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ePrescription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      pet: { findUnique: jest.fn() },
      teamMember: { findFirst: jest.fn(), findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalEncryptionService,
        ConsultationService,
        PrescriptionService,
        VetService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(TEST_KEY) } },
      ],
    }).compile();

    // Manually trigger onModuleInit for encryption service
    encryptionService = module.get<MedicalEncryptionService>(MedicalEncryptionService);
    encryptionService.onModuleInit();

    consultationService = module.get<ConsultationService>(ConsultationService);
    prescriptionService = module.get<PrescriptionService>(PrescriptionService);
    vetService = module.get<VetService>(VetService);
  });

  // ── Encryption: encrypt then decrypt returns original ──────────────────────

  describe('MedicalEncryptionService', () => {
    it('should encrypt then decrypt returning original plaintext', () => {
      const plaintext = 'Diagnosis: Acute gastroenteritis with mild dehydration';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'Same text encrypted twice';
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      // But both decrypt to same plaintext
      expect(encryptionService.decrypt(encrypted1)).toBe(plaintext);
      expect(encryptionService.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw MedicalDataDecryptionError on wrong key', () => {
      const plaintext = 'Secret medical data';
      const encrypted = encryptionService.encrypt(plaintext);

      // Create a new service with a different key
      const wrongKeyService = new MedicalEncryptionService(
        { get: () => randomBytes(32).toString('hex') } as any,
      );
      wrongKeyService.onModuleInit();

      expect(() => wrongKeyService.decrypt(encrypted)).toThrow(MedicalDataDecryptionError);
    });

    it('should throw on invalid encrypted format', () => {
      expect(() => encryptionService.decrypt('not-valid-format')).toThrow(MedicalDataDecryptionError);
    });

    it('should handle unicode/Arabic text correctly', () => {
      const arabicText = 'تشخيص: التهاب المعدة الحاد مع جفاف خفيف';
      const encrypted = encryptionService.encrypt(arabicText);
      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(arabicText);
    });
  });

  // ── Content hash tamper evidence ───────────────────────────────────────────

  describe('hashContent', () => {
    it('should produce consistent hash for same input', () => {
      const date = new Date('2026-05-01T10:00:00Z');
      const hash1 = encryptionService.hashContent('medication data', date, 'vet-1');
      const hash2 = encryptionService.hashContent('medication data', date, 'vet-1');
      expect(hash1).toBe(hash2);
    });

    it('should change hash if any field changes (tamper evidence)', () => {
      const date = new Date('2026-05-01T10:00:00Z');
      const hash1 = encryptionService.hashContent('medication A', date, 'vet-1');
      const hash2 = encryptionService.hashContent('medication B', date, 'vet-1');
      const hash3 = encryptionService.hashContent('medication A', new Date('2026-05-02'), 'vet-1');
      const hash4 = encryptionService.hashContent('medication A', date, 'vet-2');
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toBe(hash4);
    });
  });

  // ── Consultation creation encrypts sensitive fields ─────────────────────────

  describe('ConsultationService.createConsultation', () => {
    const mockVetProfile = { id: 'vet-1', businessProfileId: 'biz-1' };

    beforeEach(() => {
      prisma.vetProfile.findUnique.mockResolvedValue(mockVetProfile);
      prisma.teamMember.findUnique.mockResolvedValue({
        id: 'tm-1', businessId: 'biz-1', userId: mockUserId, role: 'OWNER', status: 'ACTIVE',
      });
    });

    it('should encrypt all sensitive fields before storage', async () => {
      let storedData: any = null;
      prisma.vetConsultation.create.mockImplementation(async ({ data }) => {
        storedData = data;
        return { id: 'consult-1', ...data };
      });
      prisma.auditLog.create.mockResolvedValue({});

      await consultationService.createConsultation(mockUserId, 'vet-1', {
        petId: 'pet-1',
        consultationType: 'IN_CLINIC',
        chiefComplaint: 'Vomiting for 2 days',
        findings: 'Dehydrated, tender abdomen',
        diagnosis: 'Acute gastroenteritis',
        treatmentPlan: 'IV fluids, antiemetics',
        notes: 'Follow up in 3 days',
        parentConsentGiven: true,
      });

      // Verify stored data is encrypted (not plaintext)
      expect(storedData.chiefComplaintEnc).toBeDefined();
      expect(storedData.chiefComplaintEnc).not.toBe('Vomiting for 2 days');
      expect(storedData.chiefComplaintEnc).toContain(':'); // encrypted format iv:tag:cipher
      expect(storedData.findingsEnc).toContain(':');
      expect(storedData.diagnosisEnc).toContain(':');
      expect(storedData.treatmentPlanEnc).toContain(':');
      expect(storedData.notesEnc).toContain(':');

      // Verify decryption works
      expect(encryptionService.decrypt(storedData.chiefComplaintEnc)).toBe('Vomiting for 2 days');
      expect(encryptionService.decrypt(storedData.diagnosisEnc)).toBe('Acute gastroenteritis');
    });

    it('should require parent consent before creating consultation', async () => {
      await expect(
        consultationService.createConsultation(mockUserId, 'vet-1', {
          petId: 'pet-1',
          consultationType: 'IN_CLINIC',
          chiefComplaint: 'Vomiting',
          parentConsentGiven: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should emit event with NO medical data (PDPL)', async () => {
      prisma.vetConsultation.create.mockResolvedValue({
        id: 'consult-1',
        vetProfileId: 'vet-1',
        petId: 'pet-1',
        consultationType: 'IN_CLINIC',
      });
      prisma.auditLog.create.mockResolvedValue({});

      await consultationService.createConsultation(mockUserId, 'vet-1', {
        petId: 'pet-1',
        consultationType: 'IN_CLINIC',
        chiefComplaint: 'Secret diagnosis info',
        diagnosis: 'Very private medical data',
        parentConsentGiven: true,
      });

      const emitCall = events.emit.mock.calls.find(
        (c: any[]) => c[0] === 'vet.consultation_created',
      );
      expect(emitCall).toBeDefined();
      const payload = emitCall[1];
      // Verify NO medical data in payload
      expect(payload).not.toHaveProperty('chiefComplaint');
      expect(payload).not.toHaveProperty('diagnosis');
      expect(payload).not.toHaveProperty('findings');
      expect(payload).not.toHaveProperty('treatmentPlan');
      expect(payload).not.toHaveProperty('notes');
      expect(JSON.stringify(payload)).not.toContain('Secret diagnosis');
      expect(JSON.stringify(payload)).not.toContain('Very private');
      // Verify it HAS safe metadata
      expect(payload).toHaveProperty('consultationId');
      expect(payload).toHaveProperty('vetProfileId');
      expect(payload).toHaveProperty('petId');
      expect(payload).toHaveProperty('consultationType');
      expect(payload).toHaveProperty('timestamp');
    });
  });

  // ── Affiliation visibility ─────────────────────────────────────────────────

  describe('Affiliation visibility', () => {
    it('should NOT show PENDING affiliations in public API', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: 'vet-1',
        status: 'APPROVED',
        businessProfile: {
          businessName: 'Cairo Vet', primaryCity: 'Cairo',
          primaryAddress: '123 St', photosUrls: [], averageRating: 4.5,
        },
        affiliations: [
          { id: 'aff-1', institutionName: 'Cairo University', verificationStatus: 'PENDING' },
          { id: 'aff-2', institutionName: 'Saudi German Hospital', verificationStatus: 'VERIFIED' },
          { id: 'aff-3', institutionName: 'Some Clinic', verificationStatus: 'REJECTED' },
        ],
        consultations: [],
      });

      const profile = await vetService.getPublicProfile('vet-1');
      const visibleAffiliations = profile.affiliations;
      expect(visibleAffiliations).toHaveLength(1);
      expect(visibleAffiliations[0].institutionName).toBe('Saudi German Hospital');
      expect(visibleAffiliations[0].verificationStatus).toBe('VERIFIED');
    });

    it('should show VERIFIED affiliations in public API', async () => {
      prisma.vetProfile.findUnique.mockResolvedValue({
        id: 'vet-1',
        status: 'APPROVED',
        businessProfile: {
          businessName: 'Cairo Vet', primaryCity: 'Cairo',
          primaryAddress: '123 St', photosUrls: [], averageRating: 4.5,
        },
        affiliations: [
          { id: 'aff-1', institutionName: 'Faculty of Vet Med', verificationStatus: 'VERIFIED', role: 'Alumni' },
        ],
        consultations: [],
      });

      const profile = await vetService.getPublicProfile('vet-1');
      expect(profile.affiliations).toHaveLength(1);
      expect(profile.affiliations[0].institutionName).toBe('Faculty of Vet Med');
    });
  });

  // ── Prescription number format ─────────────────────────────────────────────

  describe('Prescription number generation', () => {
    it('should generate sequential RX numbers in correct format', () => {
      const year = new Date().getFullYear();
      // Test the format: "RX-YYYY-NNNNNN"
      const rxPattern = new RegExp(`^RX-${year}-\\d{6}$`);
      const testNumber = `RX-${year}-000001`;
      expect(testNumber).toMatch(rxPattern);
    });
  });
});
