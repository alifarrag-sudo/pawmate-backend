import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PetsService {
  constructor(private prisma: PrismaService) {}

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
}
