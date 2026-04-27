import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MedicalEncryptionService } from '../crypto/medical-encryption.service';
import { CreatePrescriptionDto } from './vet.dto';

@Injectable()
export class PrescriptionService {
  private readonly logger = new Logger(PrescriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly encryption: MedicalEncryptionService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async createPrescription(userId: string, dto: CreatePrescriptionDto) {
    // Verify consultation exists and is active
    const consultation = await this.prisma.vetConsultation.findUnique({
      where: { id: dto.consultationId },
      include: {
        vetProfile: {
          select: { id: true, businessProfileId: true },
        },
      },
    });

    if (!consultation || !consultation.isActive) {
      throw new NotFoundException('Consultation not found');
    }

    // Verify the user is a vet team member
    const isVetTeam = await this.isVetTeamMember(
      userId,
      consultation.vetProfileId,
    );
    if (!isVetTeam) {
      throw new ForbiddenException(
        'Only vet team members can create prescriptions',
      );
    }

    // Validate expiry date is in the future
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= new Date()) {
      throw new BadRequestException('Prescription expiry must be in the future');
    }

    // Generate prescription number: RX-YYYY-NNNNNN
    const prescriptionNumber = await this.generatePrescriptionNumber();

    // Compute content hash for tamper detection
    const issuedAt = new Date();
    const contentHash = this.encryption.hashContent(
      dto.medications,
      issuedAt,
      consultation.vetProfileId,
    );

    // Encrypt medical data
    const medicationsEnc = this.encryption.encrypt(dto.medications);
    const instructionsEnc = dto.instructions
      ? this.encryption.encrypt(dto.instructions)
      : null;

    const prescription = await this.prisma.ePrescription.create({
      data: {
        consultationId: dto.consultationId,
        prescriptionNumber,
        issuedAt,
        expiresAt,
        medicationsEnc,
        instructionsEnc,
        encryptionVersion: 1,
        contentHash,
        hashAlgorithm: 'SHA-256',
        status: 'ACTIVE',
      },
    });

    // IMPORTANT: Event payload contains NO medical data (PDPL)
    this.events.emit('vet.prescription_created', {
      prescriptionId: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      consultationId: dto.consultationId,
      vetProfileId: consultation.vetProfileId,
      timestamp: issuedAt.toISOString(),
    });

    // Audit log — no medical data
    await this.prisma.auditLog.create({
      data: {
        entityType: 'EPrescription',
        entityId: prescription.id,
        action: 'prescription_created',
        actorId: userId,
        metadata: {
          prescriptionNumber,
          consultationId: dto.consultationId,
        },
      },
    });

    return this.decryptPrescription(prescription);
  }

  // ── Read Single ─────────────────────────────────────────────────────────────

  async getPrescription(userId: string, prescriptionId: string) {
    const prescription = await this.prisma.ePrescription.findUnique({
      where: { id: prescriptionId },
      include: {
        consultation: {
          include: {
            vetProfile: {
              select: { id: true, businessProfileId: true, clinicName: true },
            },
            pet: {
              select: { id: true, ownerId: true, name: true, species: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Access check: vet team member OR pet owner
    const isVetTeam = await this.isVetTeamMember(
      userId,
      prescription.consultation.vetProfileId,
    );
    const isPetOwner = prescription.consultation.pet.ownerId === userId;

    if (!isVetTeam && !isPetOwner) {
      throw new ForbiddenException('Not authorized to view this prescription');
    }

    // If pet owner views for the first time, record parentViewedAt
    if (isPetOwner && !prescription.parentViewedAt) {
      await this.prisma.ePrescription.update({
        where: { id: prescriptionId },
        data: { parentViewedAt: new Date() },
      });
    }

    return this.decryptPrescription(prescription);
  }

  // ── Get by Prescription Number ──────────────────────────────────────────────

  async getPrescriptionByNumber(userId: string, prescriptionNumber: string) {
    const prescription = await this.prisma.ePrescription.findUnique({
      where: { prescriptionNumber },
      include: {
        consultation: {
          include: {
            vetProfile: {
              select: { id: true, businessProfileId: true, clinicName: true },
            },
            pet: {
              select: { id: true, ownerId: true, name: true, species: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    // Access check
    const isVetTeam = await this.isVetTeamMember(
      userId,
      prescription.consultation.vetProfileId,
    );
    const isPetOwner = prescription.consultation.pet.ownerId === userId;

    if (!isVetTeam && !isPetOwner) {
      throw new ForbiddenException('Not authorized');
    }

    if (isPetOwner && !prescription.parentViewedAt) {
      await this.prisma.ePrescription.update({
        where: { id: prescription.id },
        data: { parentViewedAt: new Date() },
      });
    }

    return this.decryptPrescription(prescription);
  }

  // ── Prescriptions for Consultation ──────────────────────────────────────────

  async getConsultationPrescriptions(
    userId: string,
    consultationId: string,
  ) {
    const consultation = await this.prisma.vetConsultation.findUnique({
      where: { id: consultationId },
      include: {
        pet: { select: { ownerId: true } },
      },
    });

    if (!consultation || !consultation.isActive) {
      throw new NotFoundException('Consultation not found');
    }

    const isVetTeam = await this.isVetTeamMember(
      userId,
      consultation.vetProfileId,
    );
    const isPetOwner = consultation.pet.ownerId === userId;

    if (!isVetTeam && !isPetOwner) {
      throw new ForbiddenException('Not authorized');
    }

    const prescriptions = await this.prisma.ePrescription.findMany({
      where: { consultationId },
      orderBy: { issuedAt: 'desc' },
    });

    return prescriptions.map((rx) => this.decryptPrescription(rx));
  }

  // ── Dispense ────────────────────────────────────────────────────────────────

  async dispensePrescription(userId: string, prescriptionId: string) {
    const prescription = await this.prisma.ePrescription.findUnique({
      where: { id: prescriptionId },
      include: {
        consultation: {
          select: { vetProfileId: true },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot dispense a prescription with status ${prescription.status}`,
      );
    }

    if (new Date() > prescription.expiresAt) {
      // Auto-expire
      await this.prisma.ePrescription.update({
        where: { id: prescriptionId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Prescription has expired');
    }

    const isVetTeam = await this.isVetTeamMember(
      userId,
      prescription.consultation.vetProfileId,
    );
    if (!isVetTeam) {
      throw new ForbiddenException(
        'Only vet team members can dispense prescriptions',
      );
    }

    const dispensed = await this.prisma.ePrescription.update({
      where: { id: prescriptionId },
      data: {
        status: 'DISPENSED',
        dispensedAt: new Date(),
        dispensedBy: userId,
      },
    });

    // Event — no medical data
    this.events.emit('vet.prescription_dispensed', {
      prescriptionId: dispensed.id,
      prescriptionNumber: dispensed.prescriptionNumber,
      timestamp: new Date().toISOString(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'EPrescription',
        entityId: prescriptionId,
        action: 'prescription_dispensed',
        actorId: userId,
        metadata: {
          prescriptionNumber: dispensed.prescriptionNumber,
        },
      },
    });

    return this.decryptPrescription(dispensed);
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────

  async cancelPrescription(userId: string, prescriptionId: string) {
    const prescription = await this.prisma.ePrescription.findUnique({
      where: { id: prescriptionId },
      include: {
        consultation: {
          select: { vetProfileId: true },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot cancel a prescription with status ${prescription.status}`,
      );
    }

    const isVetTeam = await this.isVetTeamMember(
      userId,
      prescription.consultation.vetProfileId,
    );
    if (!isVetTeam) {
      throw new ForbiddenException(
        'Only vet team members can cancel prescriptions',
      );
    }

    const cancelled = await this.prisma.ePrescription.update({
      where: { id: prescriptionId },
      data: { status: 'CANCELLED' },
    });

    this.events.emit('vet.prescription_cancelled', {
      prescriptionId: cancelled.id,
      prescriptionNumber: cancelled.prescriptionNumber,
      timestamp: new Date().toISOString(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'EPrescription',
        entityId: prescriptionId,
        action: 'prescription_cancelled',
        actorId: userId,
        metadata: {
          prescriptionNumber: cancelled.prescriptionNumber,
        },
      },
    });

    return this.decryptPrescription(cancelled);
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Generates a prescription number in the format: RX-YYYY-NNNNNN
   * Uses a counter based on current year's prescription count.
   */
  private async generatePrescriptionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const yearPrefix = `RX-${year}-`;

    // Count existing prescriptions for this year
    const count = await this.prisma.ePrescription.count({
      where: {
        prescriptionNumber: { startsWith: yearPrefix },
      },
    });

    const sequence = String(count + 1).padStart(6, '0');
    return `${yearPrefix}${sequence}`;
  }

  /**
   * Decrypts prescription fields (medications, instructions).
   * Removes the raw encrypted fields from the returned object.
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
      // Log without medical data
      this.logger.error(
        `Decryption failed for prescription ${result.id}`,
      );
    }

    // Remove encrypted fields from response
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
