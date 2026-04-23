import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { WaiverService } from './waiver.service';
import { VaccinationCheckService } from './vaccination-check.service';
import {
  ApplyKennelDto,
  UpdateKennelProfileDto,
  CreateKennelUnitDto,
  UpdateKennelUnitDto,
  PerformIntakeDto,
  DailyLogDto,
  DischargeDto,
  ExtendStayDto,
  MedicalHoldDto,
} from './kennel.dto';

@Injectable()
export class KennelService {
  private readonly logger = new Logger(KennelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly waiverService: WaiverService,
    private readonly vaccinationCheck: VaccinationCheckService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Asserts the user is the OWNER or MANAGER of the business that owns the kennel.
   * Returns the BusinessProfile with its kennelProfile.
   */
  async assertKennelOwnerOrManager(userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        status: { not: 'REMOVED' },
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        business: {
          include: { kennelProfile: true },
        },
      },
    });

    if (!member) {
      throw new ForbiddenException(
        'Only the business owner or manager can perform this action',
      );
    }

    return {
      member,
      business: member.business,
      kennelProfile: member.business.kennelProfile,
    };
  }

  /**
   * Asserts the user is any active team member of the business that owns the kennel profile.
   */
  async assertKennelTeamMember(userId: string, kennelProfileId: string) {
    const kennel = await this.prisma.kennelProfile.findUnique({
      where: { id: kennelProfileId },
      select: { businessProfileId: true },
    });
    if (!kennel) {
      throw new NotFoundException('Kennel profile not found');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: kennel.businessProfileId,
          userId,
        },
      },
    });

    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException(
        'You are not an active team member of this kennel',
      );
    }

    return member;
  }

  /**
   * Checks if a kennel profile meets auto-approval criteria:
   * - totalUnits >= 1
   * - At least one unit created
   * - pricePerNightEgp is set
   * - liabilityWaiverText is present
   */
  private async checkAutoApproval(kennelProfileId: string): Promise<boolean> {
    const kennel = await this.prisma.kennelProfile.findUnique({
      where: { id: kennelProfileId },
      include: { _count: { select: { units: true } } },
    });
    if (!kennel) return false;

    return !!(
      kennel.totalUnits >= 1 &&
      kennel._count.units >= 1 &&
      kennel.pricePerNightEgp > 0 &&
      kennel.liabilityWaiverText
    );
  }

  // ── Profile Management ─────────────────────────────────────────────────────

  async applyForKennel(userId: string, dto: ApplyKennelDto) {
    const { business } = await this.assertKennelOwnerOrManager(userId);

    if (business.businessType !== 'KENNEL') {
      throw new BadRequestException(
        'Business type must be KENNEL to apply for a kennel profile',
      );
    }

    // Check for existing kennel profile
    const existing = await this.prisma.kennelProfile.findUnique({
      where: { businessProfileId: business.id },
    });
    if (existing) {
      throw new ConflictException('This business already has a kennel profile');
    }

    const waiverText =
      dto.liabilityWaiverText ?? this.waiverService.getDefaultWaiverTemplate();

    const kennelProfile = await this.prisma.kennelProfile.create({
      data: {
        businessProfileId: business.id,
        totalUnits: dto.totalUnits,
        facilityType: (dto.facilityType ?? 'STANDARD') as any,
        acceptsDogs: dto.acceptsDogs ?? true,
        acceptsCats: dto.acceptsCats ?? false,
        acceptsOtherPets: dto.acceptsOtherPets ?? false,
        maxPetWeightKg: dto.maxPetWeightKg,
        providesFood: dto.providesFood ?? false,
        providesBedding: dto.providesBedding ?? true,
        providesPlayArea: dto.providesPlayArea ?? false,
        playAreaHoursPerDay: dto.playAreaHoursPerDay,
        walksPerDay: dto.walksPerDay ?? 2,
        photoUpdatesPerDay: dto.photoUpdatesPerDay ?? 1,
        airConditioned: dto.airConditioned ?? true,
        heated: dto.heated ?? true,
        securityMonitored: dto.securityMonitored ?? true,
        pickupDropoffJson: dto.pickupDropoffJson,
        pricePerNightEgp: dto.pricePerNightEgp,
        pricePerNightLongStayEgp: dto.pricePerNightLongStayEgp,
        longStayThresholdNights: dto.longStayThresholdNights ?? 7,
        requiresVaccinationProof: dto.requiresVaccinationProof ?? true,
        requiresDewormingProof: dto.requiresDewormingProof ?? true,
        requiresHealthCertificate: dto.requiresHealthCertificate ?? false,
        requiredVaccines: dto.requiredVaccines ?? ['rabies', 'DHPP', 'bordetella'],
        requiredCatVaccines: dto.requiredCatVaccines ?? ['FVRCP', 'rabies'],
        liabilityWaiverText: waiverText,
        status: 'PENDING_DOCS',
      },
    });

    this.events.emit('kennel.applied', {
      kennelProfileId: kennelProfile.id,
      businessId: business.id,
      userId,
    });

    return kennelProfile;
  }

  async updateProfile(userId: string, dto: UpdateKennelProfileDto) {
    const { kennelProfile } = await this.assertKennelOwnerOrManager(userId);
    if (!kennelProfile) {
      throw new NotFoundException('Kennel profile not found');
    }

    // Build update data, excluding undefined values
    const updateData: any = {};
    const fields = [
      'totalUnits', 'acceptsDogs', 'acceptsCats', 'acceptsOtherPets',
      'maxPetWeightKg', 'providesFood', 'providesBedding', 'providesPlayArea',
      'playAreaHoursPerDay', 'walksPerDay', 'photoUpdatesPerDay',
      'airConditioned', 'heated', 'securityMonitored', 'pickupDropoffJson',
      'pricePerNightEgp', 'pricePerNightLongStayEgp', 'longStayThresholdNights',
      'requiresVaccinationProof', 'requiresDewormingProof',
      'requiresHealthCertificate', 'requiredVaccines', 'requiredCatVaccines',
    ];

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.facilityType !== undefined) {
      updateData.facilityType = dto.facilityType as any;
    }

    if (dto.liabilityWaiverText !== undefined) {
      updateData.liabilityWaiverText = dto.liabilityWaiverText;
      updateData.liabilityWaiverVersion = kennelProfile.liabilityWaiverVersion + 1;
    }

    const updated = await this.prisma.kennelProfile.update({
      where: { id: kennelProfile.id },
      data: updateData,
    });

    // Check auto-approval after update
    if (updated.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(updated.id);
      if (canApprove) {
        const approved = await this.prisma.kennelProfile.update({
          where: { id: updated.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('kennel.auto_approved', {
          kennelProfileId: approved.id,
          userId,
        });
        return approved;
      }
    }

    return updated;
  }

  // ── Unit Management ────────────────────────────────────────────────────────

  async createUnit(userId: string, dto: CreateKennelUnitDto) {
    const { kennelProfile } = await this.assertKennelOwnerOrManager(userId);
    if (!kennelProfile) {
      throw new NotFoundException('Kennel profile not found');
    }

    // Check unique unit number within this kennel
    const existingUnit = await this.prisma.kennelUnit.findUnique({
      where: {
        kennelProfileId_unitNumber: {
          kennelProfileId: kennelProfile.id,
          unitNumber: dto.unitNumber,
        },
      },
    });
    if (existingUnit) {
      throw new ConflictException(
        `Unit number "${dto.unitNumber}" already exists in this kennel`,
      );
    }

    const unit = await this.prisma.kennelUnit.create({
      data: {
        kennelProfileId: kennelProfile.id,
        unitNumber: dto.unitNumber,
        unitType: dto.unitType,
        sizeSquareMeters: dto.sizeSquareMeters,
        hasOutdoorAccess: dto.hasOutdoorAccess ?? false,
        suitableForSize: dto.suitableForSize ?? ['SMALL', 'MEDIUM'],
        maxOccupancy: dto.maxOccupancy ?? 1,
        photosUrls: dto.photosUrls ?? [],
        notes: dto.notes,
      },
    });

    // Re-check auto-approval (unit was just created)
    if (kennelProfile.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(kennelProfile.id);
      if (canApprove) {
        const approved = await this.prisma.kennelProfile.update({
          where: { id: kennelProfile.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('kennel.auto_approved', {
          kennelProfileId: approved.id,
          userId,
        });
      }
    }

    return unit;
  }

  async updateUnit(userId: string, unitId: string, dto: UpdateKennelUnitDto) {
    const { kennelProfile } = await this.assertKennelOwnerOrManager(userId);
    if (!kennelProfile) {
      throw new NotFoundException('Kennel profile not found');
    }

    const unit = await this.prisma.kennelUnit.findUnique({
      where: { id: unitId },
    });
    if (!unit || unit.kennelProfileId !== kennelProfile.id) {
      throw new NotFoundException('Unit not found in this kennel');
    }

    return this.prisma.kennelUnit.update({
      where: { id: unitId },
      data: dto as any,
    });
  }

  async setMaintenance(userId: string, unitId: string, inMaintenanceUntil: string) {
    const { kennelProfile } = await this.assertKennelOwnerOrManager(userId);
    if (!kennelProfile) {
      throw new NotFoundException('Kennel profile not found');
    }

    const unit = await this.prisma.kennelUnit.findUnique({
      where: { id: unitId },
    });
    if (!unit || unit.kennelProfileId !== kennelProfile.id) {
      throw new NotFoundException('Unit not found in this kennel');
    }

    return this.prisma.kennelUnit.update({
      where: { id: unitId },
      data: { inMaintenanceUntil: new Date(inMaintenanceUntil) },
    });
  }

  // ── Availability ───────────────────────────────────────────────────────────

  async getAvailability(
    kennelProfileId: string,
    startDate: string,
    endDate: string,
  ) {
    const kennel = await this.prisma.kennelProfile.findUnique({
      where: { id: kennelProfileId },
      select: { id: true, totalUnits: true },
    });
    if (!kennel) {
      throw new NotFoundException('Kennel profile not found');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      throw new BadRequestException('startDate must be before endDate');
    }

    // Get all overlapping stays for the date range
    const overlappingStays = await this.prisma.kennelStay.findMany({
      where: {
        kennelProfileId,
        status: { in: ['CONFIRMED', 'AWAITING_INTAKE', 'IN_STAY', 'MEDICAL_HOLD'] },
        checkInAt: { lt: end },
        expectedCheckOutAt: { gt: start },
      },
      select: {
        checkInAt: true,
        expectedCheckOutAt: true,
        actualCheckOutAt: true,
      },
    });

    // Get units under maintenance during the range
    const maintenanceUnits = await this.prisma.kennelUnit.count({
      where: {
        kennelProfileId,
        isActive: true,
        inMaintenanceUntil: { gt: start },
      },
    });

    // Build per-date availability
    const availability: Array<{
      date: string;
      totalUnits: number;
      bookedUnits: number;
      maintenanceUnits: number;
      availableUnits: number;
    }> = [];

    const current = new Date(start);
    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];

      // Count stays that overlap this specific date
      const bookedCount = overlappingStays.filter((stay) => {
        const effectiveEnd = stay.actualCheckOutAt ?? stay.expectedCheckOutAt;
        return stay.checkInAt <= current && effectiveEnd > current;
      }).length;

      const available = Math.max(
        0,
        kennel.totalUnits - bookedCount - maintenanceUnits,
      );

      availability.push({
        date: dateStr,
        totalUnits: kennel.totalUnits,
        bookedUnits: bookedCount,
        maintenanceUnits,
        availableUnits: available,
      });

      current.setDate(current.getDate() + 1);
    }

    return availability;
  }

  // ── Stay Management ────────────────────────────────────────────────────────

  async performIntake(userId: string, kennelProfileId: string, dto: PerformIntakeDto) {
    await this.assertKennelTeamMember(userId, kennelProfileId);

    const kennel = await this.prisma.kennelProfile.findUnique({
      where: { id: kennelProfileId },
    });
    if (!kennel) {
      throw new NotFoundException('Kennel profile not found');
    }

    // Verify booking and stay exist
    const stay = await this.prisma.kennelStay.findUnique({
      where: { bookingId: dto.bookingId },
      include: { booking: true },
    });
    if (!stay || stay.kennelProfileId !== kennelProfileId) {
      throw new NotFoundException('Kennel stay not found for this booking');
    }

    if (stay.status !== 'CONFIRMED' && stay.status !== 'AWAITING_INTAKE') {
      throw new BadRequestException(
        `Cannot perform intake on a stay with status "${stay.status}"`,
      );
    }

    // Verify unit exists and belongs to this kennel
    const unit = await this.prisma.kennelUnit.findUnique({
      where: { id: dto.unitId },
    });
    if (!unit || unit.kennelProfileId !== kennelProfileId) {
      throw new NotFoundException('Unit not found in this kennel');
    }

    if (!unit.isActive) {
      throw new BadRequestException('Unit is not currently active');
    }

    // Check if unit is under maintenance
    if (unit.inMaintenanceUntil && unit.inMaintenanceUntil > new Date()) {
      throw new BadRequestException('Unit is currently under maintenance');
    }

    // Validate required documents
    if (kennel.requiresVaccinationProof && (!dto.vaccinationDocs || dto.vaccinationDocs.length === 0)) {
      throw new UnprocessableEntityException(
        'Vaccination documents are required for intake at this kennel',
      );
    }
    if (kennel.requiresDewormingProof && (!dto.dewormingDocs || dto.dewormingDocs.length === 0)) {
      throw new UnprocessableEntityException(
        'Deworming documents are required for intake at this kennel',
      );
    }
    if (kennel.requiresHealthCertificate && (!dto.healthCerts || dto.healthCerts.length === 0)) {
      throw new UnprocessableEntityException(
        'Health certificate is required for intake at this kennel',
      );
    }

    // Validate waiver signature
    if (!stay.liabilityWaiverSignatureUrl && !dto.liabilityWaiverSignatureUrl) {
      throw new UnprocessableEntityException(
        'Liability waiver must be signed before intake',
      );
    }

    const now = new Date();

    const updatedStay = await this.prisma.kennelStay.update({
      where: { id: stay.id },
      data: {
        status: 'IN_STAY',
        kennelUnitId: dto.unitId,
        actualCheckInAt: now,
        intakeWeight: dto.intakeWeight,
        intakePhotos: dto.intakePhotos ?? [],
        intakeNotes: dto.intakeNotes,
        intakeDoneBy: userId,
        intakeDoneAt: now,
        vaccinationDocsUrls: dto.vaccinationDocs ?? [],
        dewormingDocsUrls: dto.dewormingDocs ?? [],
        healthCertUrls: dto.healthCerts ?? [],
        ...(dto.liabilityWaiverSignatureUrl && !stay.liabilityWaiverSignatureUrl
          ? {
              liabilityWaiverSignatureUrl: dto.liabilityWaiverSignatureUrl,
              liabilityWaiverSignedAt: now,
              liabilityWaiverVersion: kennel.liabilityWaiverVersion,
            }
          : {}),
      },
    });

    this.events.emit('kennel.pet_checked_in', {
      kennelProfileId,
      stayId: stay.id,
      bookingId: dto.bookingId,
      unitId: dto.unitId,
      userId,
    });

    return updatedStay;
  }

  async addDailyLog(userId: string, stayId: string, dto: DailyLogDto) {
    const stay = await this.prisma.kennelStay.findUnique({
      where: { id: stayId },
    });
    if (!stay) {
      throw new NotFoundException('Kennel stay not found');
    }

    await this.assertKennelTeamMember(userId, stay.kennelProfileId);

    if (stay.status !== 'IN_STAY' && stay.status !== 'MEDICAL_HOLD') {
      throw new BadRequestException(
        'Daily logs can only be added for active stays',
      );
    }

    const existingLogs = (stay.dailyUpdatesJson as any[]) ?? [];
    const newLog = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      mood: dto.mood,
      appetite: dto.appetite,
      exerciseMinutes: dto.exerciseMinutes ?? 0,
      notes: dto.notes,
      photoUrls: dto.photoUrls ?? [],
      loggedBy: userId,
    };

    const updatedLogs = [...existingLogs, newLog];

    const updatedStay = await this.prisma.kennelStay.update({
      where: { id: stayId },
      data: { dailyUpdatesJson: updatedLogs },
    });

    this.events.emit('kennel.daily_update_posted', {
      kennelProfileId: stay.kennelProfileId,
      stayId,
      bookingId: stay.bookingId,
      userId,
    });

    return updatedStay;
  }

  async discharge(userId: string, stayId: string, dto: DischargeDto) {
    const stay = await this.prisma.kennelStay.findUnique({
      where: { id: stayId },
    });
    if (!stay) {
      throw new NotFoundException('Kennel stay not found');
    }

    await this.assertKennelTeamMember(userId, stay.kennelProfileId);

    if (stay.status !== 'IN_STAY' && stay.status !== 'READY_FOR_DISCHARGE') {
      throw new BadRequestException(
        `Cannot discharge a stay with status "${stay.status}"`,
      );
    }

    const now = new Date();

    const updatedStay = await this.prisma.kennelStay.update({
      where: { id: stayId },
      data: {
        status: 'DISCHARGED',
        actualCheckOutAt: now,
        dischargeWeight: dto.dischargeWeight,
        dischargePhotos: dto.dischargePhotos ?? [],
        dischargeNotes: dto.dischargeNotes,
        dischargeDoneBy: userId,
        dischargeDoneAt: now,
      },
    });

    this.events.emit('kennel.pet_discharged', {
      kennelProfileId: stay.kennelProfileId,
      stayId,
      bookingId: stay.bookingId,
      userId,
    });

    return updatedStay;
  }

  async requestExtension(userId: string, stayId: string, dto: ExtendStayDto) {
    const stay = await this.prisma.kennelStay.findUnique({
      where: { id: stayId },
      include: { kennelProfile: true },
    });
    if (!stay) {
      throw new NotFoundException('Kennel stay not found');
    }

    await this.assertKennelTeamMember(userId, stay.kennelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException(
        'Can only extend an active stay',
      );
    }

    const newCheckOut = new Date(dto.newExpectedCheckOutAt);
    if (newCheckOut <= stay.expectedCheckOutAt) {
      throw new BadRequestException(
        'New check-out date must be after the current expected check-out date',
      );
    }

    // Calculate additional nights and cost
    const currentCheckOut = stay.expectedCheckOutAt;
    const additionalNights = Math.ceil(
      (newCheckOut.getTime() - currentCheckOut.getTime()) / (1000 * 60 * 60 * 24),
    );

    const pricePerNight = stay.kennelProfile.pricePerNightEgp;
    const calculatedCost = dto.additionalCostEgp ?? additionalNights * pricePerNight;

    const updatedStay = await this.prisma.kennelStay.update({
      where: { id: stayId },
      data: {
        expectedCheckOutAt: newCheckOut,
      },
    });

    this.events.emit('kennel.stay_extension_requested', {
      kennelProfileId: stay.kennelProfileId,
      stayId,
      bookingId: stay.bookingId,
      additionalNights,
      additionalCostEgp: calculatedCost,
      reason: dto.reason,
      userId,
    });

    return {
      ...updatedStay,
      extensionDetails: {
        additionalNights,
        additionalCostEgp: calculatedCost,
        reason: dto.reason,
      },
    };
  }

  async initiateMedicalHold(userId: string, stayId: string, dto: MedicalHoldDto) {
    const stay = await this.prisma.kennelStay.findUnique({
      where: { id: stayId },
    });
    if (!stay) {
      throw new NotFoundException('Kennel stay not found');
    }

    await this.assertKennelTeamMember(userId, stay.kennelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException(
        'Medical hold can only be initiated for active stays',
      );
    }

    const updatedStay = await this.prisma.kennelStay.update({
      where: { id: stayId },
      data: { status: 'MEDICAL_HOLD' },
    });

    this.events.emit('kennel.medical_hold_initiated', {
      kennelProfileId: stay.kennelProfileId,
      stayId,
      bookingId: stay.bookingId,
      reason: dto.reason,
      vetContact: dto.vetContact,
      userId,
    });

    return updatedStay;
  }
}
