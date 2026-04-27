import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyVetDto, UpdateVetProfileDto, CreateAffiliationDto } from './vet.dto';

@Injectable()
export class VetService {
  private readonly logger = new Logger(VetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Asserts the user is the OWNER or MANAGER of the business that owns the vet profile.
   * Returns the BusinessProfile with its vetProfile.
   */
  async assertVetOwnerOrManager(userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        status: { not: 'REMOVED' },
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        business: {
          include: { vetProfile: true },
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
      vetProfile: member.business.vetProfile,
    };
  }

  /**
   * Asserts the user is any active team member of the business that owns the vet profile.
   */
  async assertVetTeamMember(userId: string, vetProfileId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
      select: { businessProfileId: true },
    });
    if (!vet) {
      throw new NotFoundException('Vet profile not found');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: vet.businessProfileId,
          userId,
        },
      },
    });

    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException(
        'You are not an active team member of this vet clinic',
      );
    }

    return member;
  }

  /**
   * Auto-approval criteria:
   *  - licenseNumber present
   *  - syndicateCardUrl uploaded
   *  - consultationFeeEgp > 0
   *  - at least one specialty
   *  - at least one service type (offersInClinic | offersHomeVisits | offersVideoConsult)
   */
  private meetsAutoApprovalCriteria(profile: {
    licenseNumber?: string | null;
    syndicateCardUrl?: string | null;
    consultationFeeEgp?: number | null;
    specialties?: any[];
    offersInClinic?: boolean;
    offersHomeVisits?: boolean;
    offersVideoConsult?: boolean;
  }): boolean {
    const hasLicense = !!profile.licenseNumber;
    const hasSyndicateCard = !!profile.syndicateCardUrl;
    const hasFee =
      profile.consultationFeeEgp !== null &&
      profile.consultationFeeEgp !== undefined &&
      profile.consultationFeeEgp > 0;
    const hasSpecialty =
      Array.isArray(profile.specialties) && profile.specialties.length >= 1;
    const hasService =
      !!profile.offersInClinic ||
      !!profile.offersHomeVisits ||
      !!profile.offersVideoConsult;

    return hasLicense && hasSyndicateCard && hasFee && hasSpecialty && hasService;
  }

  // ── Profile Management ─────────────────────────────────────────────────────

  async applyForVet(userId: string, dto: ApplyVetDto) {
    const { business } = await this.assertVetOwnerOrManager(userId);

    if (business.businessType !== 'VET_CLINIC') {
      throw new BadRequestException(
        'Business type must be VET_CLINIC to apply for a vet profile',
      );
    }

    const existing = await this.prisma.vetProfile.findUnique({
      where: { businessProfileId: business.id },
    });
    if (existing) {
      throw new ConflictException('This business already has a vet profile');
    }

    const vetProfile = await this.prisma.vetProfile.create({
      data: {
        businessProfileId: business.id,
        licenseNumber: dto.licenseNumber,
        syndicateCardUrl: dto.syndicateCardUrl,
        clinicName: dto.clinicName,
        specialties: (dto.specialties ?? []) as any[],
        offersInClinic: dto.offersInClinic ?? true,
        offersHomeVisits: dto.offersHomeVisits ?? false,
        homeVisitRadiusKm: dto.homeVisitRadiusKm,
        homeVisitCostEgp: dto.homeVisitCostEgp,
        offersVideoConsult: dto.offersVideoConsult ?? false,
        offersEmergency: dto.offersEmergency ?? false,
        emergencyPhone: dto.emergencyPhone,
        emergencyAvailability: dto.emergencyAvailability,
        consultationFeeEgp: dto.consultationFeeEgp,
        homeVisitFeeEgp: dto.homeVisitFeeEgp,
        videoConsultFeeEgp: dto.videoConsultFeeEgp,
        consentText: dto.consentText,
        status: 'PENDING_DOCS',
      },
    });

    // Check auto-approval immediately
    if (this.meetsAutoApprovalCriteria(vetProfile)) {
      const approved = await this.prisma.vetProfile.update({
        where: { id: vetProfile.id },
        data: { status: 'APPROVED' },
      });

      this.events.emit('vet.auto_approved', {
        vetProfileId: approved.id,
        businessId: business.id,
        userId,
      });

      return approved;
    }

    this.events.emit('vet.applied', {
      vetProfileId: vetProfile.id,
      businessId: business.id,
      userId,
    });

    return vetProfile;
  }

  async updateProfile(userId: string, dto: UpdateVetProfileDto) {
    const { vetProfile } = await this.assertVetOwnerOrManager(userId);
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }

    const updateData: Record<string, any> = {};
    const scalarFields = [
      'clinicName',
      'syndicateCardUrl',
      'offersInClinic',
      'offersHomeVisits',
      'homeVisitRadiusKm',
      'homeVisitCostEgp',
      'offersVideoConsult',
      'offersEmergency',
      'emergencyPhone',
      'emergencyAvailability',
      'consultationFeeEgp',
      'homeVisitFeeEgp',
      'videoConsultFeeEgp',
      'consentText',
    ];

    for (const field of scalarFields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.specialties !== undefined) {
      updateData.specialties = dto.specialties as any[];
    }

    const updated = await this.prisma.vetProfile.update({
      where: { id: vetProfile.id },
      data: updateData,
    });

    // Re-check auto-approval after update
    if (updated.status === 'PENDING_DOCS') {
      const canApprove = this.meetsAutoApprovalCriteria(updated);
      if (canApprove) {
        const approved = await this.prisma.vetProfile.update({
          where: { id: updated.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('vet.auto_approved', {
          vetProfileId: approved.id,
          userId,
        });
        return approved;
      }
    }

    return updated;
  }

  async getMyProfile(userId: string) {
    const { vetProfile } = await this.assertVetOwnerOrManager(userId);
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }

    return this.prisma.vetProfile.findUnique({
      where: { id: vetProfile.id },
      include: {
        affiliations: { orderBy: { createdAt: 'desc' } },
        consultations: {
          orderBy: { consultedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            petId: true,
            consultationType: true,
            consultedAt: true,
            followUpRequired: true,
            followUpDate: true,
            weight: true,
            createdAt: true,
            // NEVER return encrypted fields in list views
          },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            primaryLat: true,
            primaryLng: true,
            photosUrls: true,
            averageRating: true,
            totalBookings: true,
          },
        },
      },
    });
  }

  async getPublicProfile(id: string) {
    const profile = await this.prisma.vetProfile.findUnique({
      where: { id },
      select: {
        id: true,
        clinicName: true,
        specialties: true,
        offersInClinic: true,
        offersHomeVisits: true,
        homeVisitRadiusKm: true,
        offersVideoConsult: true,
        offersEmergency: true,
        emergencyPhone: true,
        emergencyAvailability: true,
        consultationFeeEgp: true,
        homeVisitFeeEgp: true,
        videoConsultFeeEgp: true,
        status: true,
        createdAt: true,
        // Only show VERIFIED affiliations publicly
        affiliations: {
          where: { verificationStatus: 'VERIFIED' },
          select: {
            institutionName: true,
            role: true,
            verificationStatus: true,
          },
        },
        // Stats only — NEVER return encrypted fields
        _count: {
          select: { consultations: { where: { isActive: true } } },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            primaryLat: true,
            primaryLng: true,
            photosUrls: true,
            averageRating: true,
            totalBookings: true,
            businessEmail: true,
            businessPhone: true,
          },
        },
      },
    });

    if (!profile || profile.status !== 'APPROVED') {
      throw new NotFoundException('Vet clinic not found');
    }

    return profile;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async searchVets(filters: {
    city?: string;
    specialty?: string;
    affiliationVerified?: boolean;
    query?: string;
    page: number;
  }) {
    const pageSize = 12;
    const skip = (filters.page - 1) * pageSize;

    const where: any = {
      status: 'APPROVED',
      businessProfile: {},
    };

    if (filters.city) {
      where.businessProfile.primaryCity = {
        contains: filters.city,
        mode: 'insensitive',
      };
    }

    if (filters.specialty) {
      where.specialties = { has: filters.specialty as any };
    }

    if (filters.affiliationVerified) {
      where.affiliations = {
        some: { verificationStatus: 'VERIFIED' },
      };
    }

    if (filters.query) {
      where.OR = [
        { clinicName: { contains: filters.query, mode: 'insensitive' } },
        {
          businessProfile: {
            businessName: { contains: filters.query, mode: 'insensitive' },
          },
        },
      ];
    }

    const [vets, total] = await Promise.all([
      this.prisma.vetProfile.findMany({
        where,
        select: {
          id: true,
          clinicName: true,
          specialties: true,
          offersInClinic: true,
          offersHomeVisits: true,
          offersVideoConsult: true,
          offersEmergency: true,
          consultationFeeEgp: true,
          homeVisitFeeEgp: true,
          videoConsultFeeEgp: true,
          status: true,
          affiliations: {
            where: { verificationStatus: 'VERIFIED' },
            select: {
              institutionName: true,
              role: true,
            },
          },
          _count: {
            select: { consultations: { where: { isActive: true } } },
          },
          businessProfile: {
            select: {
              businessName: true,
              primaryCity: true,
              primaryAddress: true,
              primaryLat: true,
              primaryLng: true,
              photosUrls: true,
              averageRating: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vetProfile.count({ where }),
    ]);

    return {
      data: vets,
      total,
      page: filters.page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Affiliations ────────────────────────────────────────────────────────────

  async createAffiliation(userId: string, dto: CreateAffiliationDto) {
    const { vetProfile } = await this.assertVetOwnerOrManager(userId);
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }

    const affiliation = await this.prisma.vetAffiliation.create({
      data: {
        vetProfileId: vetProfile.id,
        institutionName: dto.institutionName,
        role: dto.role,
        licenseOrId: dto.licenseOrId,
        documentUrl: dto.documentUrl,
        verificationStatus: 'PENDING',
      },
    });

    this.events.emit('vet.affiliation_requested', {
      affiliationId: affiliation.id,
      vetProfileId: vetProfile.id,
      institutionName: dto.institutionName,
      userId,
    });

    return affiliation;
  }

  async getAffiliations(userId: string) {
    const { vetProfile } = await this.assertVetOwnerOrManager(userId);
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }

    return this.prisma.vetAffiliation.findMany({
      where: { vetProfileId: vetProfile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin Review Endpoints ──────────────────────────────────────────────────

  async adminVerifyAffiliation(
    adminUserId: string,
    affiliationId: string,
    approve: boolean,
    rejectionReason?: string,
  ) {
    const affiliation = await this.prisma.vetAffiliation.findUnique({
      where: { id: affiliationId },
    });
    if (!affiliation) {
      throw new NotFoundException('Affiliation not found');
    }

    const updated = await this.prisma.vetAffiliation.update({
      where: { id: affiliationId },
      data: {
        verificationStatus: approve ? 'VERIFIED' : 'REJECTED',
        verifiedAt: new Date(),
        verifiedBy: adminUserId,
        rejectionReason: approve ? null : (rejectionReason ?? 'Rejected by admin'),
      },
    });

    if (approve) {
      // If syndicate card is also present, mark syndicateVerified on the vet profile
      const vetProfile = await this.prisma.vetProfile.findUnique({
        where: { id: affiliation.vetProfileId },
      });
      if (vetProfile && vetProfile.syndicateCardUrl && !vetProfile.syndicateVerified) {
        await this.prisma.vetProfile.update({
          where: { id: vetProfile.id },
          data: {
            syndicateVerified: true,
            syndicateVerifiedAt: new Date(),
            syndicateVerifiedBy: adminUserId,
          },
        });
      }
    }

    this.events.emit('vet.affiliation_reviewed', {
      affiliationId: updated.id,
      vetProfileId: affiliation.vetProfileId,
      status: updated.verificationStatus,
    });

    return updated;
  }

  async adminReviewVetProfile(
    adminUserId: string,
    vetProfileId: string,
    approve: boolean,
  ) {
    const vetProfile = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
    });
    if (!vetProfile) {
      throw new NotFoundException('Vet profile not found');
    }

    const updated = await this.prisma.vetProfile.update({
      where: { id: vetProfileId },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'VetProfile',
        entityId: vetProfileId,
        action: approve ? 'admin_approved' : 'admin_rejected',
        actorId: adminUserId,
        metadata: {},
      },
    });

    this.events.emit('vet.profile_reviewed', {
      vetProfileId: updated.id,
      status: updated.status,
      adminUserId,
    });

    return updated;
  }
}
