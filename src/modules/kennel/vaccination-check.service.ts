import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface VaccinationCheckResult {
  complete: boolean;
  missing: string[];
  preVerified: boolean;
  vaccinationDocsUrls: string[];
}

// TODO: LAUNCH BLOCKER - Encryption with MEDICAL_DATA_ENCRYPTION_KEY is not yet configured.
// Vaccination documents and health records must be encrypted at rest before production launch.
// Cloudinary uploads should go under pawmate/{petId}/vaccinations/ folder.

@Injectable()
export class VaccinationCheckService {
  private readonly logger = new Logger(VaccinationCheckService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks a pet's vaccination records against the kennel's required vaccines.
   * At booking time, if incomplete, the booking proceeds with a
   * "pending_vaccination_verification" flag.
   * At intake, the kennel team confirms docs visually.
   */
  async checkVaccinationStatus(
    petId: string,
    kennelProfileId: string,
  ): Promise<VaccinationCheckResult> {
    const [pet, kennel] = await Promise.all([
      this.prisma.pet.findUnique({
        where: { id: petId },
        select: { id: true, species: true },
      }),
      this.prisma.kennelProfile.findUnique({
        where: { id: kennelProfileId },
        select: {
          requiredVaccines: true,
          requiredCatVaccines: true,
          requiresVaccinationProof: true,
        },
      }),
    ]);

    if (!pet) throw new NotFoundException('Pet not found');
    if (!kennel) throw new NotFoundException('Kennel profile not found');

    // If kennel doesn't require vaccination proof, skip check
    if (!kennel.requiresVaccinationProof) {
      return {
        complete: true,
        missing: [],
        preVerified: false,
        vaccinationDocsUrls: [],
      };
    }

    // Determine required vaccines based on pet species
    const speciesLower = (pet.species ?? '').toLowerCase();
    const isCat = speciesLower === 'cat';
    const requiredVaccines = isCat
      ? kennel.requiredCatVaccines
      : kennel.requiredVaccines;

    // Fetch pet's vaccination records (only non-expired ones)
    const vaccinations = await this.prisma.petVaccination.findMany({
      where: {
        petId,
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: new Date() } },
        ],
      },
      select: {
        vaccineName: true,
        documentUrl: true,
      },
    });

    const vaccineNames = vaccinations.map((v) =>
      v.vaccineName.toLowerCase().trim(),
    );

    const docUrls = vaccinations
      .map((v) => v.documentUrl)
      .filter((url): url is string => !!url);

    const missing: string[] = [];
    for (const required of requiredVaccines) {
      const normalizedRequired = required.toLowerCase().trim();
      const found = vaccineNames.some(
        (name) => name === normalizedRequired || name.includes(normalizedRequired),
      );
      if (!found) {
        missing.push(required);
      }
    }

    const complete = missing.length === 0;
    const preVerified = complete && docUrls.length >= requiredVaccines.length;

    this.logger.log(
      `Vaccination check for pet ${petId}: complete=${complete}, missing=${JSON.stringify(missing)}`,
    );

    return {
      complete,
      missing,
      preVerified,
      vaccinationDocsUrls: docUrls,
    };
  }
}
