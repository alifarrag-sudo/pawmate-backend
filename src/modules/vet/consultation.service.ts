import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MedicalEncryptionService } from '../crypto/medical-encryption.service';
import { CreateConsultationDto, UpdateConsultationDto } from './vet.dto';

@Injectable()
export class ConsultationService {
  private readonly logger = new Logger(ConsultationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly encryption: MedicalEncryptionService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async createConsultation(
    userId: string,
    vetProfileId: string,
    dto: CreateConsultationDto,
  ) {
    // Verify consent — PDPL Law 151/2020 requirement
    if (!dto.parentConsentGiven) {
      throw new BadRequestException(
        'Parent consent is required before creating medical records (PDPL Law 151/2020)',
      );
    }

    // Verify vet profile exists and is approved
    const vetProfile = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
    });
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }
    if (vetProfile.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Vet profile must be approved to create consultations',
      );
    }

    // Verify pet exists
    const pet = await this.prisma.pet.findUnique({
      where: { id: dto.petId },
      select: { id: true, ownerId: true },
    });
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    // Encrypt sensitive medical fields
    const encrypted: Record<string, string | undefined> = {};
    if (dto.chiefComplaint) {
      encrypted.chiefComplaintEnc = this.encryption.encrypt(dto.chiefComplaint);
    }
    if (dto.findings) {
      encrypted.findingsEnc = this.encryption.encrypt(dto.findings);
    }
    if (dto.diagnosis) {
      encrypted.diagnosisEnc = this.encryption.encrypt(dto.diagnosis);
    }
    if (dto.treatmentPlan) {
      encrypted.treatmentPlanEnc = this.encryption.encrypt(dto.treatmentPlan);
    }
    if (dto.notes) {
      encrypted.notesEnc = this.encryption.encrypt(dto.notes);
    }

    const consultation = await this.prisma.vetConsultation.create({
      data: {
        vetProfileId,
        petId: dto.petId,
        bookingId: dto.bookingId,
        consultationType: dto.consultationType as any,
        consultedAt: new Date(),
        ...encrypted,
        encryptionVersion: 1,
        weight: dto.weight,
        temperature: dto.temperature,
        heartRate: dto.heartRate,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
        followUpRequired: !!dto.followUpDate,
        parentConsentGiven: true,
        parentConsentAt: new Date(),
        consentVersion: 1,
      },
    });

    // IMPORTANT: Event payload contains NO medical data (PDPL)
    this.events.emit('vet.consultation_created', {
      consultationId: consultation.id,
      vetProfileId,
      petId: dto.petId,
      consultationType: dto.consultationType,
      timestamp: new Date().toISOString(),
    });

    // Audit log — no medical data in metadata
    await this.prisma.auditLog.create({
      data: {
        entityType: 'VetConsultation',
        entityId: consultation.id,
        action: 'consultation_created',
        actorId: userId,
        metadata: {
          consultationType: dto.consultationType,
          petId: dto.petId,
        },
      },
    });

    return this.decryptConsultation(consultation);
  }

  // ── Read Single ─────────────────────────────────────────────────────────────

  async getConsultation(userId: string, consultationId: string) {
    const consultation = await this.prisma.vetConsultation.findUnique({
      where: { id: consultationId },
      include: {
        vetProfile: {
          include: {
            businessProfile: { select: { ownerId: true } },
          },
        },
        pet: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            species: true,
            breed: true,
          },
        },
        prescriptions: true,
      },
    });

    if (!consultation || !consultation.isActive) {
      throw new NotFoundException('Consultation not found');
    }

    // Access check: vet team member OR pet owner
    const isVetTeam = await this.isVetTeamMember(
      userId,
      consultation.vetProfileId,
    );
    const isPetOwner = consultation.pet.ownerId === userId;

    if (!isVetTeam && !isPetOwner) {
      throw new ForbiddenException('Not authorized to view this record');
    }

    const decrypted = this.decryptConsultation(consultation);

    // Decrypt prescription fields for the response
    if (decrypted.prescriptions) {
      decrypted.prescriptions = decrypted.prescriptions.map((rx: any) =>
        this.decryptPrescription(rx),
      );
    }

    return decrypted;
  }

  // ── Pet History ─────────────────────────────────────────────────────────────

  async getPetHistory(userId: string, vetProfileId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({
      where: { id: petId },
      select: { ownerId: true },
    });
    if (!pet) {
      throw new NotFoundException('Pet not found');
    }

    const isVetTeam = await this.isVetTeamMember(userId, vetProfileId);
    const isPetOwner = pet.ownerId === userId;

    if (!isVetTeam && !isPetOwner) {
      throw new ForbiddenException('Not authorized');
    }

    const consultations = await this.prisma.vetConsultation.findMany({
      where: { vetProfileId, petId, isActive: true },
      include: { prescriptions: true },
      orderBy: { consultedAt: 'desc' },
    });

    return consultations.map((c) => {
      const decrypted = this.decryptConsultation(c);
      if (decrypted.prescriptions) {
        decrypted.prescriptions = decrypted.prescriptions.map((rx: any) =>
          this.decryptPrescription(rx),
        );
      }
      return decrypted;
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async updateConsultation(
    userId: string,
    consultationId: string,
    dto: UpdateConsultationDto,
  ) {
    const consultation = await this.prisma.vetConsultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation || !consultation.isActive) {
      throw new NotFoundException('Consultation not found');
    }

    const isVetTeam = await this.isVetTeamMember(
      userId,
      consultation.vetProfileId,
    );
    if (!isVetTeam) {
      throw new ForbiddenException('Only vet team can update consultations');
    }

    const updateData: Record<string, any> = {};

    // Re-encrypt updated sensitive fields
    if (dto.chiefComplaint !== undefined) {
      updateData.chiefComplaintEnc = this.encryption.encrypt(dto.chiefComplaint);
    }
    if (dto.findings !== undefined) {
      updateData.findingsEnc = this.encryption.encrypt(dto.findings);
    }
    if (dto.diagnosis !== undefined) {
      updateData.diagnosisEnc = this.encryption.encrypt(dto.diagnosis);
    }
    if (dto.treatmentPlan !== undefined) {
      updateData.treatmentPlanEnc = this.encryption.encrypt(dto.treatmentPlan);
    }
    if (dto.notes !== undefined) {
      updateData.notesEnc = this.encryption.encrypt(dto.notes);
    }

    // Non-encrypted fields
    if (dto.weight !== undefined) {
      updateData.weight = dto.weight;
    }
    if (dto.temperature !== undefined) {
      updateData.temperature = dto.temperature;
    }
    if (dto.heartRate !== undefined) {
      updateData.heartRate = dto.heartRate;
    }
    if (dto.followUpDate !== undefined) {
      updateData.followUpDate = dto.followUpDate
        ? new Date(dto.followUpDate)
        : null;
      updateData.followUpRequired = !!dto.followUpDate;
    }

    const updated = await this.prisma.vetConsultation.update({
      where: { id: consultationId },
      data: updateData,
    });

    // Audit log — record which fields changed, but NOT the medical data
    await this.prisma.auditLog.create({
      data: {
        entityType: 'VetConsultation',
        entityId: consultationId,
        action: 'consultation_updated',
        actorId: userId,
        metadata: { updatedFields: Object.keys(updateData) },
      },
    });

    return this.decryptConsultation(updated);
  }

  // ── Soft Delete ─────────────────────────────────────────────────────────────

  async softDeleteConsultation(userId: string, consultationId: string) {
    const consultation = await this.prisma.vetConsultation.findUnique({
      where: { id: consultationId },
    });
    if (!consultation || !consultation.isActive) {
      throw new NotFoundException('Consultation not found');
    }

    const isVetTeam = await this.isVetTeamMember(
      userId,
      consultation.vetProfileId,
    );
    if (!isVetTeam) {
      throw new ForbiddenException('Only vet team can delete consultations');
    }

    const deleted = await this.prisma.vetConsultation.update({
      where: { id: consultationId },
      data: { isActive: false, deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'VetConsultation',
        entityId: consultationId,
        action: 'consultation_soft_deleted',
        actorId: userId,
        metadata: {},
      },
    });

    return { id: deleted.id, isActive: false };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Decrypts all encrypted fields on a consultation record.
   * Removes the raw encrypted fields from the returned object.
   * NEVER logs plaintext medical data.
   */
  private decryptConsultation(consultation: any): any {
    const result = { ...consultation };

    try {
      if (result.chiefComplaintEnc) {
        result.chiefComplaint = this.encryption.decrypt(
          result.chiefComplaintEnc,
        );
      }
      if (result.findingsEnc) {
        result.findings = this.encryption.decrypt(result.findingsEnc);
      }
      if (result.diagnosisEnc) {
        result.diagnosis = this.encryption.decrypt(result.diagnosisEnc);
      }
      if (result.treatmentPlanEnc) {
        result.treatmentPlan = this.encryption.decrypt(
          result.treatmentPlanEnc,
        );
      }
      if (result.notesEnc) {
        result.notes = this.encryption.decrypt(result.notesEnc);
      }
    } catch {
      // Log without medical data — never expose plaintext in logs
      this.logger.error(
        `Decryption failed for consultation ${result.id}`,
      );
    }

    // Remove encrypted fields from response
    delete result.chiefComplaintEnc;
    delete result.findingsEnc;
    delete result.diagnosisEnc;
    delete result.treatmentPlanEnc;
    delete result.notesEnc;

    return result;
  }

  /**
   * Decrypts prescription fields (medications, instructions).
   * NEVER logs plaintext medical data.
   */
  private decryptPrescription(prescription: any): any {
    const result = { ...prescription };

    try {
      if (result.medicationsEnc) {
        result.medications = this.encryption.decrypt(result.medicationsEnc);
      }
      if (result.instructionsEnc) {
        result.instructions = this.encryption.decrypt(result.instructionsEnc);
      }
    } catch {
      this.logger.error(
        `Decryption failed for prescription ${result.id}`,
      );
    }

    delete result.medicationsEnc;
    delete result.instructionsEnc;

    return result;
  }

  /**
   * Checks if a user is an active team member of the business owning the vet profile.
   */
  private async isVetTeamMember(
    userId: string,
    vetProfileId: string,
  ): Promise<boolean> {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
      select: { businessProfileId: true },
    });
    if (!vet) return false;

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: vet.businessProfileId,
          userId,
        },
      },
    });

    return !!(member && member.status !== 'REMOVED');
  }
}
