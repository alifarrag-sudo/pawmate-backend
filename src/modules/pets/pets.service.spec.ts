import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PetsService } from './pets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MedicalEncryptionService } from '../crypto/medical-encryption.service';

/**
 * Unit tests for the medical-subresource methods on PetsService.
 *
 * Each tested method follows the same shape:
 *   1. Verify caller owns the pet (assertOwnedPet)
 *   2. Touch the relevant Prisma table (PetVaccination / PetMedication /
 *      PetSchedule / PetBehavior)
 *   3. Return the row(s) or { success: true } for deletes.
 *
 * The ownership check is the critical bit — outsiders must never see or
 * mutate another user's medical history. We assert that explicitly for
 * every read AND write path.
 */
describe('PetsService — medical subresources', () => {
  let service: PetsService;
  let prisma: {
    pet: { findFirst: jest.Mock };
    petVaccination: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    petMedication: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    petSchedule: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    petBehavior: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const ownedPetId = 'pet-1';
  const ownerId = 'owner-1';
  const otherUserId = 'someone-else';

  beforeEach(async () => {
    prisma = {
      pet: { findFirst: jest.fn() },
      petVaccination: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      petMedication: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      petSchedule: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      petBehavior: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    // PetsService gained UploadsService + MedicalEncryptionService +
    // EventEmitter2 deps in G1. The medical-subresource tests don't
    // exercise any of them, so jest.fn() stubs are sufficient — but
    // Nest still needs class-token providers wired up before compile()
    // or DI fails before any test runs.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadsService, useValue: { uploadPrivateFile: jest.fn(), signedUrlFor: jest.fn() } },
        { provide: MedicalEncryptionService, useValue: { encrypt: jest.fn(), decrypt: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<PetsService>(PetsService);
  });

  // assertOwnedPet's contract: owner sees the pet, anyone else gets NotFound.
  // We mock pet.findFirst to honor the where filter so the same mock works
  // for both positive and negative paths.
  function mockPetOwnership() {
    prisma.pet.findFirst.mockImplementation(({ where }: any) => {
      if (where.id === ownedPetId && where.ownerId === ownerId) {
        return Promise.resolve({ id: ownedPetId });
      }
      return Promise.resolve(null);
    });
  }

  // ── Vaccinations ────────────────────────────────────────────────────────

  describe('listVaccinations', () => {
    it('returns vaccinations ordered by administeredDate desc for the owner', async () => {
      mockPetOwnership();
      const rows = [{ id: 'v2' }, { id: 'v1' }];
      prisma.petVaccination.findMany.mockResolvedValue(rows);

      const r = await service.listVaccinations(ownerId, ownedPetId);

      expect(r).toEqual(rows);
      expect(prisma.petVaccination.findMany).toHaveBeenCalledWith({
        where: { petId: ownedPetId },
        orderBy: { administeredDate: 'desc' },
      });
    });

    it('throws NotFound for non-owner before hitting findMany', async () => {
      mockPetOwnership();
      await expect(service.listVaccinations(otherUserId, ownedPetId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.petVaccination.findMany).not.toHaveBeenCalled();
    });
  });

  describe('addVaccination', () => {
    it('creates a vaccination using the canonical field names', async () => {
      mockPetOwnership();
      prisma.petVaccination.create.mockResolvedValue({ id: 'v1' });

      await service.addVaccination(ownerId, ownedPetId, {
        vaccineName: 'Rabies',
        administeredDate: '2026-01-15',
        expiryDate: '2027-01-15',
        documentUrl: 'https://cdn/doc.pdf',
        notes: 'booster',
      });

      expect(prisma.petVaccination.create).toHaveBeenCalledWith({
        data: {
          petId: ownedPetId,
          vaccineName: 'Rabies',
          administeredDate: new Date('2026-01-15'),
          expiryDate: new Date('2027-01-15'),
          documentUrl: 'https://cdn/doc.pdf',
          notes: 'booster',
        },
      });
    });

    it('accepts legacy aliases name / date / nextDueDate / vetName', async () => {
      mockPetOwnership();
      prisma.petVaccination.create.mockResolvedValue({ id: 'v1' });

      await service.addVaccination(ownerId, ownedPetId, {
        name: 'DHPP',
        date: '2026-02-01',
        nextDueDate: '2027-02-01',
        vetName: 'Dr Sara',
      } as any);

      const call = prisma.petVaccination.create.mock.calls[0][0];
      expect(call.data.vaccineName).toBe('DHPP');
      expect(call.data.administeredDate).toEqual(new Date('2026-02-01'));
      expect(call.data.expiryDate).toEqual(new Date('2027-02-01'));
      expect(call.data.notes).toBe('Vet: Dr Sara');
    });

    it('rejects when vaccineName / name is missing', async () => {
      mockPetOwnership();
      await expect(
        service.addVaccination(ownerId, ownedPetId, {} as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.petVaccination.create).not.toHaveBeenCalled();
    });

    it('rejects non-owner before any write', async () => {
      mockPetOwnership();
      await expect(
        service.addVaccination(otherUserId, ownedPetId, { vaccineName: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petVaccination.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteVaccination', () => {
    it('hard-deletes a vaccination owned by the caller', async () => {
      mockPetOwnership();
      prisma.petVaccination.findFirst.mockResolvedValue({ id: 'v1', petId: ownedPetId });
      prisma.petVaccination.delete.mockResolvedValue({ id: 'v1' });

      const r = await service.deleteVaccination(ownerId, ownedPetId, 'v1');

      expect(r).toEqual({ success: true });
      expect(prisma.petVaccination.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    });

    it('throws NotFound when vaccination does not belong to the pet', async () => {
      mockPetOwnership();
      prisma.petVaccination.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteVaccination(ownerId, ownedPetId, 'foreign-v'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petVaccination.delete).not.toHaveBeenCalled();
    });
  });

  // ── Medications ──────────────────────────────────────────────────────────

  describe('listMedications', () => {
    it('returns only active medications for the owner', async () => {
      mockPetOwnership();
      const rows = [{ id: 'm1' }];
      prisma.petMedication.findMany.mockResolvedValue(rows);

      const r = await service.listMedications(ownerId, ownedPetId);

      expect(r).toEqual(rows);
      expect(prisma.petMedication.findMany).toHaveBeenCalledWith({
        where: { petId: ownedPetId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws NotFound for non-owner', async () => {
      mockPetOwnership();
      await expect(service.listMedications(otherUserId, ownedPetId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.petMedication.findMany).not.toHaveBeenCalled();
    });
  });

  describe('addMedication', () => {
    it('creates a medication with sensible defaults + accepts dose alias', async () => {
      mockPetOwnership();
      prisma.petMedication.create.mockResolvedValue({ id: 'm1' });

      await service.addMedication(ownerId, ownedPetId, {
        name: 'Apoquel',
        dose: '5mg',
        frequency: 'twice_daily',
        startDate: '2026-04-01',
      } as any);

      const call = prisma.petMedication.create.mock.calls[0][0];
      expect(call.data.petId).toBe(ownedPetId);
      expect(call.data.name).toBe('Apoquel');
      expect(call.data.dosage).toBe('5mg');           // dose → dosage alias
      expect(call.data.medicationType).toBe('pill');  // default
      expect(call.data.frequency).toBe('twice_daily');
      expect(call.data.adminTimes).toEqual(['08:00']);// default
      expect(call.data.startDate).toEqual(new Date('2026-04-01'));
      expect(call.data.endDate).toBeNull();
      expect(call.data.isActive).toBe(true);
    });

    it('rejects when name is missing', async () => {
      mockPetOwnership();
      await expect(
        service.addMedication(ownerId, ownedPetId, {} as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.petMedication.create).not.toHaveBeenCalled();
    });

    it('rejects non-owner before any write', async () => {
      mockPetOwnership();
      await expect(
        service.addMedication(otherUserId, ownedPetId, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petMedication.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteMedication', () => {
    it('soft-deletes (isActive=false) instead of hard delete', async () => {
      mockPetOwnership();
      prisma.petMedication.findFirst.mockResolvedValue({ id: 'm1', petId: ownedPetId });
      prisma.petMedication.update.mockResolvedValue({ id: 'm1', isActive: false });

      const r = await service.deleteMedication(ownerId, ownedPetId, 'm1');

      expect(r).toEqual({ success: true });
      expect(prisma.petMedication.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { isActive: false },
      });
    });

    it('throws NotFound when medication does not belong to the pet', async () => {
      mockPetOwnership();
      prisma.petMedication.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteMedication(ownerId, ownedPetId, 'foreign-m'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.petMedication.update).not.toHaveBeenCalled();
    });
  });

  // ── Schedules ────────────────────────────────────────────────────────────

  describe('listSchedules / addSchedule', () => {
    it('lists active schedules ordered by type then time', async () => {
      mockPetOwnership();
      prisma.petSchedule.findMany.mockResolvedValue([{ id: 's1' }]);

      await service.listSchedules(ownerId, ownedPetId);

      expect(prisma.petSchedule.findMany).toHaveBeenCalledWith({
        where: { petId: ownedPetId, isActive: true },
        orderBy: [{ scheduleType: 'asc' }, { scheduledTime: 'asc' }],
      });
    });

    it('addSchedule accepts time alias and applies defaults', async () => {
      mockPetOwnership();
      prisma.petSchedule.create.mockResolvedValue({ id: 's1' });

      await service.addSchedule(ownerId, ownedPetId, {
        scheduleType: 'feeding',
        time: '07:30',
        foodAmount: '1 cup',
      } as any);

      const call = prisma.petSchedule.create.mock.calls[0][0];
      expect(call.data.scheduleType).toBe('feeding');
      expect(call.data.scheduledTime).toBe('07:30');  // time → scheduledTime alias
      expect(call.data.foodAmount).toBe('1 cup');
      expect(call.data.isActive).toBe(true);
    });

    it('addSchedule rejects when scheduleType is missing', async () => {
      mockPetOwnership();
      await expect(
        service.addSchedule(ownerId, ownedPetId, {} as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.petSchedule.create).not.toHaveBeenCalled();
    });

    it('non-owner gets NotFound on both list and add', async () => {
      mockPetOwnership();
      await expect(
        service.listSchedules(otherUserId, ownedPetId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.addSchedule(otherUserId, ownedPetId, { scheduleType: 'feeding' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Behavior (1:1) ──────────────────────────────────────────────────────

  describe('getBehavior / upsertBehavior', () => {
    it('returns the behavior row by petId', async () => {
      mockPetOwnership();
      const row = { petId: ownedPetId, energyLevel: 'high' };
      prisma.petBehavior.findUnique.mockResolvedValue(row);

      const r = await service.getBehavior(ownerId, ownedPetId);

      expect(r).toEqual(row);
      expect(prisma.petBehavior.findUnique).toHaveBeenCalledWith({
        where: { petId: ownedPetId },
      });
    });

    it('upserts behavior with the supplied tags + energy level', async () => {
      mockPetOwnership();
      prisma.petBehavior.upsert.mockResolvedValue({ petId: ownedPetId });

      await service.upsertBehavior(ownerId, ownedPetId, {
        temperamentTags: ['friendly', 'playful'],
        energyLevel: 'high',
        goodWithKids: 'yes',
      });

      const call = prisma.petBehavior.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ petId: ownedPetId });
      expect(call.create.temperamentTags).toEqual(['friendly', 'playful']);
      expect(call.create.energyLevel).toBe('high');
      expect(call.update.temperamentTags).toEqual(['friendly', 'playful']);
      expect(call.update.energyLevel).toBe('high');
    });

    it('non-owner gets NotFound on both get and upsert', async () => {
      mockPetOwnership();
      await expect(service.getBehavior(otherUserId, ownedPetId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.upsertBehavior(otherUserId, ownedPetId, { energyLevel: 'low' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
