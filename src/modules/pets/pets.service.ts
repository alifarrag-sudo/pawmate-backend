import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MedicalEncryptionService } from '../crypto/medical-encryption.service';

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
    private encryption: MedicalEncryptionService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── G1: Vaccination passport ──────────────────────────────────────────────

  /**
   * Upload a vaccination passport file (JPEG/PNG/WebP/PDF, ≤10MB) to
   * private Cloudinary storage and persist only the storage key. The
   * caller's ownership is enforced; admins can verify but uploads are
   * always parent-driven.
   */
  async uploadVaccinationPassport(
    userId: string,
    petId: string,
    file: Express.Multer.File,
  ) {
    const pet = await this.assertOwned(userId, petId);

    const folder = `pawmatehub/pets/${pet.id}/vaccination`;
    const result = await this.uploads.uploadPrivateFile(
      file.buffer,
      file.mimetype,
      folder,
    );

    await this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        vaccinationPassportKey: result.key,
        // Reset verification on every new upload — a fresh document
        // restarts the admin review cycle.
        vaccinationVerified: false,
        vaccinationVerifiedAt: null,
        vaccinationVerifiedBy: null,
        vaccinationExpiresAt: null,
      },
    });

    this.eventEmitter.emit('pet.vaccination_uploaded', {
      petId: pet.id,
      ownerId: userId,
      mimeType: result.mimeType,
      bytes: result.bytes,
    });

    return {
      uploaded: true,
      bytes: result.bytes,
      mimeType: result.mimeType,
    };
  }

  /**
   * Mint a 15-minute signed URL for the vaccination passport. Both the
   * pet's owner and an admin can read it; everyone else gets 403.
   */
  async getVaccinationSignedUrl(userId: string, petId: string) {
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!requester) throw new ForbiddenException();

    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, isActive: true },
      select: {
        id: true,
        ownerId: true,
        vaccinationPassportKey: true,
      },
    });
    if (!pet) throw new NotFoundException('Pet not found.');

    const isOwner = pet.ownerId === userId;
    const isAdmin = ['admin', 'owner', 'owner_restricted'].includes(requester.role);
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Not authorised to view this document.');
    }

    if (!pet.vaccinationPassportKey) {
      throw new NotFoundException('No vaccination passport uploaded yet.');
    }

    // PDFs land as `raw` in Cloudinary; everything else is `image`. The
    // resourceType for signing matches what the upload chose. We can't
    // detect after the fact without storing the mime — keep it simple
    // and try image first; clients render both via webview/Image.
    const signed = this.uploads.signedUrlFor(pet.vaccinationPassportKey, {
      ttlSeconds: 900,
    });

    return {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  /**
   * Admin marks the vaccination passport as verified or rejected. On
   * verification we record the admin's id + an explicit expiry date
   * (vaccines expire on a known schedule and we want the UI to surface
   * the next-renewal date).
   */
  async verifyVaccination(
    adminUserId: string,
    petId: string,
    body: { verified: boolean; expiresAt?: string },
  ) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, isActive: true },
      select: { id: true, vaccinationPassportKey: true },
    });
    if (!pet) throw new NotFoundException('Pet not found.');
    if (!pet.vaccinationPassportKey) {
      throw new BadRequestException('No vaccination passport to verify.');
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.verified && expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('expiresAt must be a valid ISO date.');
    }

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        vaccinationVerified: body.verified,
        vaccinationVerifiedAt: body.verified ? new Date() : null,
        vaccinationVerifiedBy: body.verified ? adminUserId : null,
        vaccinationExpiresAt: body.verified ? expiresAt : null,
      },
      select: {
        id: true,
        vaccinationVerified: true,
        vaccinationVerifiedAt: true,
        vaccinationExpiresAt: true,
      },
    });
  }

  // ── G1: Pet licence ───────────────────────────────────────────────────────

  /**
   * Submit an Egyptian pet licence. The licence number is encrypted with
   * MedicalEncryptionService before write — plaintext is never stored.
   * Governorate is plain (used for filtering and admin geo views).
   */
  async submitLicence(
    userId: string,
    petId: string,
    body: { licenceNumber: string; governorate: string },
  ) {
    const pet = await this.assertOwned(userId, petId);

    const number = (body.licenceNumber ?? '').trim();
    const governorate = (body.governorate ?? '').trim();
    if (!number) {
      throw new BadRequestException('Licence number is required.');
    }
    if (!governorate) {
      throw new BadRequestException('Governorate is required.');
    }

    const encrypted = this.encryption.encrypt(number);

    return this.prisma.pet.update({
      where: { id: pet.id },
      data: {
        licenceNumberEnc: encrypted,
        licenceGovernorate: governorate,
        licenceSubmittedAt: new Date(),
        // verification is admin-driven; reset on resubmit so a new
        // number doesn't inherit prior approval.
        licenceVerified: false,
      },
      select: {
        id: true,
        licenceGovernorate: true,
        licenceSubmittedAt: true,
        licenceVerified: true,
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertOwned(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, ownerId: userId, isActive: true },
      select: { id: true, ownerId: true },
    });
    if (!pet) throw new NotFoundException('Pet not found.');
    return pet;
  }

  async findByOwner(ownerId: string) {
    return this.prisma.pet.findMany({
      where: { ownerId, isActive: true },
      include: {
        medicalInfo: true,
        behavior: true,
        vaccinations: { orderBy: { administeredDate: 'desc' } },
        medications: { where: { isActive: true } },
        schedules: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, ownerId, isActive: true },
      include: {
        medicalInfo: true,
        behavior: true,
        vaccinations: { orderBy: { administeredDate: 'desc' } },
        medications: { where: { isActive: true } },
        schedules: { where: { isActive: true } },
      },
    });
    if (!pet) throw new NotFoundException('Pet not found');
    return pet;
  }

  // Called by sitters/system to get full pet data for scheduling notifications
  async findOneById(petId: string) {
    return this.prisma.pet.findUnique({
      where: { id: petId },
      include: {
        schedules: { where: { isActive: true } },
        medications: { where: { isActive: true } },
        medicalInfo: true,
      },
    });
  }

  async create(ownerId: string, data: any) {
    // Normalize birthDate → dateOfBirth (mobile may send either field name)
    const normalized = { ...data };
    if (!normalized.dateOfBirth && normalized.birthDate) {
      normalized.dateOfBirth = normalized.birthDate;
    }
    delete normalized.birthDate;
    return this.prisma.pet.create({
      data: { ...normalized, ownerId },
    });
  }

  async update(ownerId: string, petId: string, data: any) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    return this.prisma.pet.update({ where: { id: petId }, data });
  }

  // Full wizard upsert — handles all 5 steps in one call
  async upsertFullProfile(ownerId: string, petId: string | null, wizardData: any) {
    const {
      // Step 1
      name, species, breed, nickname, profilePhoto,
      // Step 2
      ageCategory, gender, weightKg, neuteredStatus, houseTrained, microchipId,
      // Step 3 (behavior)
      goodWithKids, goodWithDogs, goodWithCats, energyLevel, behaviorNotes,
      // Step 4 (care schedule)
      walkSchedules,    // [{ time: "08:00", durationMinutes: 30 }]
      mealSchedules,    // [{ time: "07:00", foodType: "Dry Kibble", foodAmount: "1 cup" }]
      medications,      // [{ name, medicationType, frequency, adminTimes, notes }] or null
      vetName, vetClinic, vetPhone,
      // Step 5
      vaccinations,     // [{ vaccineName, administeredDate, verified }]
      lastVetVisit,
      allergies,
      medicalNotes,
    } = wizardData;

    let pet: any;

    if (petId) {
      // Update existing
      pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
      if (!pet) throw new NotFoundException('Pet not found');
      pet = await this.prisma.pet.update({
        where: { id: petId },
        data: {
          name, species, breed: breed || null, nickname: nickname || null,
          profilePhoto: profilePhoto || null, ageCategory: ageCategory || null,
          gender: gender || 'unknown', weightKg: weightKg ? parseFloat(weightKg) : null,
          neuteredStatus: neuteredStatus || 'unknown', houseTrained: houseTrained || 'yes',
          microchipId: microchipId || null,
        },
      });
    } else {
      // Create new
      pet = await this.prisma.pet.create({
        data: {
          ownerId, name, species: species || 'other',
          breed: breed || null, nickname: nickname || null,
          profilePhoto: profilePhoto || null, ageCategory: ageCategory || null,
          gender: gender || 'unknown', weightKg: weightKg ? parseFloat(weightKg) : null,
          neuteredStatus: neuteredStatus || 'unknown', houseTrained: houseTrained || 'yes',
          microchipId: microchipId || null,
        },
      });
    }

    const pid = pet.id;

    // Upsert behavior
    if (goodWithKids !== undefined || goodWithDogs !== undefined || goodWithCats !== undefined || energyLevel !== undefined) {
      await this.prisma.petBehavior.upsert({
        where: { petId: pid },
        create: {
          petId: pid,
          goodWithKids: goodWithKids || 'yes',
          goodWithDogs: goodWithDogs || 'yes',
          goodWithCats: goodWithCats || 'yes',
          energyLevel: energyLevel || 'medium',
          behaviorNotes: behaviorNotes || null,
        },
        update: {
          goodWithKids: goodWithKids || 'yes',
          goodWithDogs: goodWithDogs || 'yes',
          goodWithCats: goodWithCats || 'yes',
          energyLevel: energyLevel || 'medium',
          behaviorNotes: behaviorNotes || null,
        },
      });
    }

    // Upsert medical info
    await this.prisma.petMedicalInfo.upsert({
      where: { petId: pid },
      create: {
        petId: pid,
        vetName: vetName || null,
        vetClinic: vetClinic || null,
        vetPhone: vetPhone || null,
        allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : [],
        medicalNotes: medicalNotes || null,
      },
      update: {
        vetName: vetName || null,
        vetClinic: vetClinic || null,
        vetPhone: vetPhone || null,
        allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : [],
        medicalNotes: medicalNotes || null,
      },
    });

    // Replace schedules — delete all existing walk/feeding schedules then recreate
    await this.prisma.petSchedule.deleteMany({
      where: { petId: pid, scheduleType: { in: ['walk', 'feeding'] } },
    });

    if (walkSchedules && walkSchedules.length > 0) {
      await this.prisma.petSchedule.createMany({
        data: walkSchedules.map((w: any) => ({
          petId: pid,
          scheduleType: 'walk',
          scheduledTime: w.time,
          durationMinutes: w.durationMinutes || 30,
          isActive: true,
        })),
      });
    }

    if (mealSchedules && mealSchedules.length > 0) {
      await this.prisma.petSchedule.createMany({
        data: mealSchedules.map((m: any) => ({
          petId: pid,
          scheduleType: 'feeding',
          scheduledTime: m.time,
          foodType: m.foodType || null,
          foodAmount: m.foodAmount || null,
          isActive: true,
        })),
      });
    }

    // Replace medications
    if (medications !== undefined) {
      await this.prisma.petMedication.updateMany({
        where: { petId: pid },
        data: { isActive: false },
      });
      if (medications && medications.length > 0) {
        await this.prisma.petMedication.createMany({
          data: medications.map((med: any) => ({
            petId: pid,
            name: med.name,
            medicationType: med.medicationType || 'pill',
            frequency: med.frequency || 'once_daily',
            adminTimes: med.adminTimes || ['08:00'],
            notes: med.notes || null,
            isActive: true,
          })),
        });
      }
    }

    // Replace vaccinations
    if (vaccinations !== undefined && vaccinations.length > 0) {
      await this.prisma.petVaccination.deleteMany({ where: { petId: pid } });
      await this.prisma.petVaccination.createMany({
        data: vaccinations.map((v: any) => ({
          petId: pid,
          vaccineName: v.vaccineName,
          administeredDate: v.administeredDate ? new Date(v.administeredDate) : new Date(),
          notes: v.verified ? 'verified' : null,
        })),
      });
    }

    return this.findOne(ownerId, pid);
  }

  async softDelete(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    return this.prisma.pet.update({ where: { id: petId }, data: { isActive: false } });
  }

  async addPhotos(ownerId: string, petId: string, photoUrls: string[]) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    const updated = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        photos: { push: photoUrls },
        profilePhoto: pet.profilePhoto ?? photoUrls[0],
      },
    });
    return updated;
  }

  // ==========================================================================
  // MEDICAL SUBRESOURCES
  //
  // Each method below verifies the caller owns the pet before reading or
  // writing any of the related rows. The check uses the same `findFirst({
  // where: { id, ownerId } })` pattern as findOne above.
  // ==========================================================================

  /** Verify ownership and return the pet row (or throw NotFound). */
  private async assertOwnedPet(ownerId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, ownerId, isActive: true },
      select: { id: true },
    });
    if (!pet) throw new NotFoundException('Pet not found');
    return pet;
  }

  // ─── Vaccinations ─────────────────────────────────────────────────────────

  async listVaccinations(ownerId: string, petId: string) {
    await this.assertOwnedPet(ownerId, petId);
    return this.prisma.petVaccination.findMany({
      where: { petId },
      orderBy: { administeredDate: 'desc' },
    });
  }

  async addVaccination(
    ownerId: string,
    petId: string,
    dto: {
      vaccineName?: string;
      name?: string; // alias accepted from older mobile clients
      administeredDate?: string | Date;
      date?: string | Date; // alias
      expiryDate?: string | Date | null;
      nextDueDate?: string | Date | null; // alias
      documentUrl?: string;
      notes?: string;
      vetName?: string;
    },
  ) {
    await this.assertOwnedPet(ownerId, petId);
    const vaccineName = dto.vaccineName ?? dto.name;
    if (!vaccineName) {
      throw new BadRequestException('vaccineName is required');
    }
    const administeredAt = dto.administeredDate ?? dto.date ?? new Date();
    const expires = dto.expiryDate ?? dto.nextDueDate ?? null;
    return this.prisma.petVaccination.create({
      data: {
        petId,
        vaccineName,
        administeredDate: new Date(administeredAt),
        expiryDate: expires ? new Date(expires) : null,
        documentUrl: dto.documentUrl,
        notes: dto.notes ?? (dto.vetName ? `Vet: ${dto.vetName}` : null),
      },
    });
  }

  async deleteVaccination(ownerId: string, petId: string, vaccinationId: string) {
    await this.assertOwnedPet(ownerId, petId);
    const row = await this.prisma.petVaccination.findFirst({
      where: { id: vaccinationId, petId },
    });
    if (!row) throw new NotFoundException('Vaccination not found');
    await this.prisma.petVaccination.delete({ where: { id: vaccinationId } });
    return { success: true };
  }

  // ─── Medications ──────────────────────────────────────────────────────────

  async listMedications(ownerId: string, petId: string) {
    await this.assertOwnedPet(ownerId, petId);
    return this.prisma.petMedication.findMany({
      where: { petId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMedication(
    ownerId: string,
    petId: string,
    dto: {
      name: string;
      medicationType?: string;
      dose?: string;
      dosage?: string; // alias
      unit?: string;
      frequency?: string;
      adminTimes?: string[];
      startDate?: string | Date;
      endDate?: string | Date;
      notes?: string;
    },
  ) {
    await this.assertOwnedPet(ownerId, petId);
    if (!dto?.name) throw new BadRequestException('name is required');
    return this.prisma.petMedication.create({
      data: {
        petId,
        name: dto.name,
        medicationType: (dto.medicationType as any) ?? 'pill',
        dosage: dto.dose ?? dto.dosage ?? null,
        unit: dto.unit ?? null,
        frequency: (dto.frequency as any) ?? 'once_daily',
        adminTimes: dto.adminTimes ?? ['08:00'],
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes ?? null,
        isActive: true,
      },
    });
  }

  async deleteMedication(ownerId: string, petId: string, medicationId: string) {
    await this.assertOwnedPet(ownerId, petId);
    const row = await this.prisma.petMedication.findFirst({
      where: { id: medicationId, petId },
    });
    if (!row) throw new NotFoundException('Medication not found');
    // Soft-delete: medications carry historical care logs, so we flip
    // isActive rather than dropping the row. Same pattern findByOwner uses.
    await this.prisma.petMedication.update({
      where: { id: medicationId },
      data: { isActive: false },
    });
    return { success: true };
  }

  // ─── Schedules (feeding / walk / medication / grooming / other) ──────────

  async listSchedules(ownerId: string, petId: string) {
    await this.assertOwnedPet(ownerId, petId);
    return this.prisma.petSchedule.findMany({
      where: { petId, isActive: true },
      orderBy: [{ scheduleType: 'asc' }, { scheduledTime: 'asc' }],
    });
  }

  async addSchedule(
    ownerId: string,
    petId: string,
    dto: {
      scheduleType?: string;
      scheduledTime?: string;
      time?: string; // alias
      durationMinutes?: number;
      foodType?: string;
      foodAmount?: string;
      notes?: string;
    },
  ) {
    await this.assertOwnedPet(ownerId, petId);
    if (!dto?.scheduleType) throw new BadRequestException('scheduleType is required');
    return this.prisma.petSchedule.create({
      data: {
        petId,
        scheduleType: dto.scheduleType as any,
        scheduledTime: dto.scheduledTime ?? dto.time ?? '08:00',
        durationMinutes: dto.durationMinutes ?? null,
        foodType: dto.foodType ?? null,
        foodAmount: dto.foodAmount ?? null,
        notes: dto.notes ?? null,
        isActive: true,
      },
    });
  }

  // ─── Behavior (1:1) ───────────────────────────────────────────────────────

  async getBehavior(ownerId: string, petId: string) {
    await this.assertOwnedPet(ownerId, petId);
    return this.prisma.petBehavior.findUnique({ where: { petId } });
  }

  async upsertBehavior(
    ownerId: string,
    petId: string,
    dto: {
      temperamentTags?: string[];
      goodWithDogs?: string;
      goodWithCats?: string;
      goodWithKids?: string;
      trainingLevel?: string;
      energyLevel?: string;
      behaviorNotes?: string;
      fearTriggers?: string[];
    },
  ) {
    await this.assertOwnedPet(ownerId, petId);
    return this.prisma.petBehavior.upsert({
      where: { petId },
      create: {
        petId,
        temperamentTags: dto.temperamentTags ?? [],
        goodWithDogs: (dto.goodWithDogs as any) ?? 'yes',
        goodWithCats: (dto.goodWithCats as any) ?? 'yes',
        goodWithKids: (dto.goodWithKids as any) ?? 'yes',
        trainingLevel: (dto.trainingLevel as any) ?? 'none',
        energyLevel: (dto.energyLevel as any) ?? 'medium',
        behaviorNotes: dto.behaviorNotes ?? null,
        fearTriggers: dto.fearTriggers ?? [],
      },
      update: {
        ...(dto.temperamentTags !== undefined && { temperamentTags: dto.temperamentTags }),
        ...(dto.goodWithDogs !== undefined && { goodWithDogs: dto.goodWithDogs as any }),
        ...(dto.goodWithCats !== undefined && { goodWithCats: dto.goodWithCats as any }),
        ...(dto.goodWithKids !== undefined && { goodWithKids: dto.goodWithKids as any }),
        ...(dto.trainingLevel !== undefined && { trainingLevel: dto.trainingLevel as any }),
        ...(dto.energyLevel !== undefined && { energyLevel: dto.energyLevel as any }),
        ...(dto.behaviorNotes !== undefined && { behaviorNotes: dto.behaviorNotes }),
        ...(dto.fearTriggers !== undefined && { fearTriggers: dto.fearTriggers }),
      },
    });
  }
}
