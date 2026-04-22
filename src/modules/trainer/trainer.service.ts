import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from '../mail/mail.service';
import { UpdateTrainerProfileDto, MarkSessionCompleteDto } from './trainer.dto';
import { TrainerStatus, ProviderPayoutMethod } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const INSTANT_CASHOUT_FEE_RATE = 0.03;
const INSTANT_CASHOUT_MIN_EGP  = 100;
const ELITE_MIN_RATING          = 4.7;   // Stricter than PetFriend (4.5)
const ELITE_MIN_SESSIONS        = 30;    // Stricter than PetFriend (20 bookings)
const COMMISSION_ELITE          = 0.10;
const COMMISSION_DEFAULT        = 0.15;
const PAGE_SIZE                 = 20;

// Valid trainer service types matching PricingBounds
const VALID_SERVICE_TYPES = [
  'TRAINING_SESSION_1HR',
  'TRAINING_SESSION_2HR',
  'TRAINING_PACKAGE_6',
  'TRAINING_PROGRAM_8WK',
  'BEHAVIOR_ASSESSMENT',
] as const;

// Document fields on Trainer vs User
type DocumentField =
  | 'profilePhoto'
  | 'idFront'
  | 'idBack'
  | 'certification'
  | 'showcaseVideo'
  | 'facilityPhoto';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isEliteTier(avgRating: number | null, totalSessions: number): boolean {
  return (avgRating ?? 0) >= ELITE_MIN_RATING && totalSessions >= ELITE_MIN_SESSIONS;
}

function resolveCommissionRate(avgRating: number | null, totalSessions: number): number {
  return isEliteTier(avgRating, totalSessions) ? COMMISSION_ELITE : COMMISSION_DEFAULT;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TrainerService {
  private readonly logger = new Logger(TrainerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mail: MailService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Apply — creates profile shell
  // ──────────────────────────────────────────────────────────────────────────
  async applyForTrainer(userId: string) {
    const existing = await this.prisma.trainerProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('Trainer profile already exists for this account.');
    }

    const profile = await this.prisma.trainerProfile.create({
      data: {
        userId,
        status: TrainerStatus.PENDING_DOCS,
        appliedAt: new Date(),
        commissionRate: COMMISSION_DEFAULT,
      },
    });

    // Add TRAINER to user.roles[]
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: { push: 'TRAINER' },
      },
    });

    this.eventEmitter.emit('trainer.applied', {
      userId,
      profileId: profile.id,
      appliedAt: profile.appliedAt,
    });

    return { profileId: profile.id, status: profile.status };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Update profile fields
  // ──────────────────────────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateTrainerProfileDto) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Trainer profile not found. Apply first.');
    }
    if (profile.status === TrainerStatus.SUSPENDED) {
      throw new ForbiddenException('Cannot update profile while suspended.');
    }

    // Validate pricing against bounds if servicesJson is being updated
    if (dto.servicesJson && dto.servicesJson.length > 0) {
      await this.validateServicesAgainstBounds(
        dto.servicesJson,
        profile.averageRating,
        profile.totalSessions,
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.bio              !== undefined) updateData.bio              = dto.bio;
    if (dto.specialties      !== undefined) updateData.specialties      = dto.specialties;
    if (dto.experienceYears  !== undefined) updateData.experienceYears  = dto.experienceYears;
    if (dto.languages        !== undefined) updateData.languages        = dto.languages;
    if (dto.city             !== undefined) updateData.city             = dto.city;
    if (dto.inHomeVisits     !== undefined) updateData.inHomeVisits     = dto.inHomeVisits;
    if (dto.ownFacility      !== undefined) updateData.ownFacility      = dto.ownFacility;
    if (dto.facilityAddress  !== undefined) updateData.facilityAddress  = dto.facilityAddress;
    if (dto.virtualSessions  !== undefined) updateData.virtualSessions  = dto.virtualSessions;
    if (dto.serviceRadiusKm  !== undefined) updateData.serviceRadiusKm  = dto.serviceRadiusKm;
    if (dto.baseLat          !== undefined) updateData.baseLat          = dto.baseLat;
    if (dto.baseLng          !== undefined) updateData.baseLng          = dto.baseLng;
    if (dto.servicesJson     !== undefined) updateData.servicesJson     = dto.servicesJson;
    if (dto.certificationsJson !== undefined) updateData.certificationsJson = dto.certificationsJson;
    if (dto.availabilityJson !== undefined) updateData.availabilityJson = dto.availabilityJson;
    if (dto.maxSessionsPerDay !== undefined) updateData.maxSessionsPerDay = dto.maxSessionsPerDay;
    if (dto.payoutMethodJson !== undefined) updateData.payoutMethodJson = dto.payoutMethodJson;

    const updated = await this.prisma.trainerProfile.update({
      where: { userId },
      data: updateData as any,
    });

    await this.checkAndAutoApprove(userId, updated);
    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Upload document
  // ──────────────────────────────────────────────────────────────────────────
  async uploadDocument(
    userId: string,
    documentType: DocumentField,
    fileBuffer: Buffer,
    mimeType: string,
  ) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Trainer profile not found. Apply first.');
    }

    const isVideo = documentType === 'showcaseVideo';
    const folder = isVideo ? 'trainer_videos' : documentType === 'profilePhoto' ? 'profile_photos' : 'id_documents';
    const result = await this.uploads.uploadImage(fileBuffer, folder, { maxWidth: isVideo ? undefined : 1200 });

    switch (documentType) {
      case 'profilePhoto':
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { profilePhotoUrl: result.url },
        });
        break;
      case 'idFront':
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { idFrontUrl: result.url },
        });
        // Also update User table for shared KYC
        await this.prisma.user.update({
          where: { id: userId },
          data: { idFrontUrl: result.url },
        });
        break;
      case 'idBack':
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { idBackUrl: result.url },
        });
        await this.prisma.user.update({
          where: { id: userId },
          data: { idBackUrl: result.url },
        });
        break;
      case 'certification': {
        const certs = (profile.certificationsJson as any[]) ?? [];
        certs.push({ url: result.url, uploadedAt: new Date().toISOString() });
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { certificationsJson: certs },
        });
        break;
      }
      case 'showcaseVideo':
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { showcaseVideoUrl: result.url },
        });
        break;
      case 'facilityPhoto': {
        await this.prisma.trainerProfile.update({
          where: { userId },
          data: { facilityPhotosUrls: { push: result.url } },
        });
        break;
      }
    }

    // Re-check completion
    const updatedProfile = await this.prisma.trainerProfile.findUnique({ where: { userId } });
    if (updatedProfile) {
      await this.checkAndAutoApprove(userId, updatedProfile);
    }

    return { documentType, url: result.url, publicId: result.publicId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /trainer/me
  // ──────────────────────────────────────────────────────────────────────────
  async getMyProfile(userId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profilePhoto: true,
            email: true,
            phone: true,
            roles: true,
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Trainer profile not found.');
    }

    const { completionPercent, missingFields, nextStep } = this.computeCompletion(profile);
    return { ...profile, completionPercent, missingFields, nextStep };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /trainer/:id (public)
  // ──────────────────────────────────────────────────────────────────────────
  async getPublicProfile(profileId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: { firstName: true, lastName: true, profilePhoto: true },
        },
      },
    });
    if (!profile || profile.status !== TrainerStatus.APPROVED) {
      throw new NotFoundException('Trainer profile not found.');
    }

    return {
      id: profile.id,
      user: profile.user,
      bio: profile.bio,
      specialties: profile.specialties,
      experienceYears: profile.experienceYears,
      languages: profile.languages,
      city: profile.city,
      profilePhotoUrl: profile.profilePhotoUrl,
      certificationsJson: profile.certificationsJson,
      showcaseVideoUrl: profile.showcaseVideoUrl,
      inHomeVisits: profile.inHomeVisits,
      ownFacility: profile.ownFacility,
      facilityAddress: profile.facilityAddress,
      facilityPhotosUrls: profile.facilityPhotosUrls,
      virtualSessions: profile.virtualSessions,
      serviceRadiusKm: profile.serviceRadiusKm,
      servicesJson: profile.servicesJson,
      availabilityJson: profile.availabilityJson,
      maxSessionsPerDay: profile.maxSessionsPerDay,
      totalSessions: profile.totalSessions,
      totalPrograms: profile.totalPrograms,
      averageRating: profile.averageRating,
      fiveStarCount: profile.fiveStarCount,
      completionRate: profile.completionRate,
      createdAt: profile.createdAt,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /trainers?city=&specialty=&deliveryMode=&page=
  // ──────────────────────────────────────────────────────────────────────────
  async searchTrainers(filters: {
    city?: string;
    specialty?: string;
    deliveryMode?: string;
    page?: number;
  }) {
    const page = filters.page ?? 1;
    const where: Record<string, unknown> = {
      status: TrainerStatus.APPROVED,
    };

    if (filters.city) where.city = filters.city;
    if (filters.specialty) where.specialties = { has: filters.specialty };
    if (filters.deliveryMode) {
      if (filters.deliveryMode === 'IN_HOME') where.inHomeVisits = true;
      if (filters.deliveryMode === 'FACILITY') where.ownFacility = true;
      if (filters.deliveryMode === 'VIRTUAL') where.virtualSessions = true;
    }

    const [trainers, total] = await Promise.all([
      this.prisma.trainerProfile.findMany({
        where: where as any,
        include: {
          user: { select: { firstName: true, lastName: true, profilePhoto: true } },
        },
        orderBy: [{ averageRating: 'desc' }, { totalSessions: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.trainerProfile.count({ where: where as any }),
    ]);

    return {
      trainers,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Mark session complete (programs/packages)
  // ──────────────────────────────────────────────────────────────────────────
  async markSessionComplete(
    userId: string,
    bookingId: string,
    dto: MarkSessionCompleteDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { trainerProfile: true },
    });
    if (!booking || !booking.trainerProfile) {
      throw new NotFoundException('Trainer booking not found.');
    }
    if (booking.trainerProfile.userId !== userId) {
      throw new ForbiddenException('You can only mark your own sessions as complete.');
    }
    if (booking.status !== 'active') {
      throw new BadRequestException('Booking must be in active status.');
    }

    const newCompleted = booking.sessionsCompleted + 1;
    const isLastSession = booking.sessionsTotal != null && newCompleted >= booking.sessionsTotal;

    // Add session notes
    const existingNotes = (booking.trainerNotes as any[]) ?? [];
    existingNotes.push({
      sessionNum: newCompleted,
      date: new Date().toISOString(),
      notes: dto.notes ?? null,
      homework: dto.homework ?? null,
    });

    const updateData: Record<string, unknown> = {
      sessionsCompleted: newCompleted,
      trainerNotes: existingNotes,
    };

    if (isLastSession) {
      updateData.status = 'completed';
      updateData.actualEnd = new Date();
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: updateData as any,
    });

    // Emit events
    this.eventEmitter.emit('program.session_completed', {
      bookingId,
      trainerProfileId: booking.trainerProfileId,
      sessionNumber: newCompleted,
      total: booking.sessionsTotal,
    });

    if (isLastSession) {
      this.eventEmitter.emit('program.completed', {
        bookingId,
        trainerProfileId: booking.trainerProfileId,
        parentId: booking.parentId,
      });

      // Recalculate payout
      if (booking.trainerProfile) {
        await this.prisma.trainerProfile.update({
          where: { id: booking.trainerProfileId! },
          data: {
            totalSessions: { increment: 1 },
            totalPrograms: { increment: booking.sessionsTotal != null && booking.sessionsTotal > 1 ? 1 : 0 },
            pendingBalanceEgp: { increment: Number(booking.providerPayout) },
          },
        });
      }
    }

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Instant cashout
  // ──────────────────────────────────────────────────────────────────────────
  async instantCashout(userId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        availableBalanceEgp: true,
        payoutMethodJson: true,
        status: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Trainer profile not found.');
    }
    if (profile.status !== TrainerStatus.APPROVED) {
      throw new ForbiddenException('Only approved Trainers can request payouts.');
    }

    const available = profile.availableBalanceEgp;
    if (available < INSTANT_CASHOUT_MIN_EGP) {
      throw new BadRequestException(
        `Minimum balance for instant cashout is ${INSTANT_CASHOUT_MIN_EGP} EGP. Current: ${available} EGP.`,
      );
    }

    const feeEgp = Math.ceil(available * INSTANT_CASHOUT_FEE_RATE);
    const netEgp = available - feeEgp;

    const payout = await this.prisma.trainerPayout.create({
      data: {
        trainerId: profile.id,
        amount: available,
        payoutMethod: ProviderPayoutMethod.bank_transfer,
        status: 'pending',
        type: 'INSTANT',
        netEgp,
        instantCashoutFeeEgp: feeEgp,
        requestedAt: new Date(),
        scheduledFor: new Date(),
      },
    });

    await this.prisma.trainerProfile.update({
      where: { id: profile.id },
      data: { availableBalanceEgp: { decrement: available } },
    });

    this.eventEmitter.emit('payout.instant_requested', {
      userId,
      profileId: profile.id,
      payoutId: payout.id,
      providerType: 'TRAINER',
      amount: available,
      feeEgp,
      netEgp,
    });

    return { payoutId: payout.id, amount: available, feeEgp, netEgp, status: payout.status };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: list pending review
  // ──────────────────────────────────────────────────────────────────────────
  async adminListPendingReview() {
    return this.prisma.trainerProfile.findMany({
      where: { status: TrainerStatus.ADMIN_REVIEW },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
      orderBy: { appliedAt: 'asc' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: review (approve/reject)
  // ──────────────────────────────────────────────────────────────────────────
  async adminReview(
    profileId: string,
    action: 'approve' | 'reject',
    reason: string | undefined,
    adminUserId: string,
  ) {
    const profile = await this.prisma.trainerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Trainer profile not found.');
    if (action === 'reject' && !reason) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const newStatus = action === 'approve' ? TrainerStatus.APPROVED : TrainerStatus.REJECTED;
    const updated = await this.prisma.trainerProfile.update({
      where: { id: profileId },
      data: {
        status: newStatus,
        adminReviewedAt: new Date(),
        adminReviewedBy: adminUserId,
        rejectionReason: action === 'reject' ? reason : null,
      },
    });

    const eventName = action === 'approve' ? 'trainer.admin_approved' : 'trainer.rejected';
    this.eventEmitter.emit(eventName, {
      profileId, userId: profile.userId, action, reason, adminUserId,
    });

    if (action === 'reject') {
      this.prisma.user.findUnique({
        where: { id: profile.userId },
        select: { email: true, firstName: true },
      }).then(user => {
        if (user) return this.mail.sendTrainerRejection(user, reason);
      }).catch(e => this.logger.warn(`sendTrainerRejection failed: ${e.message}`));
    }

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: suspend
  // ──────────────────────────────────────────────────────────────────────────
  async adminSuspend(
    profileId: string,
    reason: string,
    until: Date | undefined,
    adminUserId: string,
  ) {
    const profile = await this.prisma.trainerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Trainer profile not found.');

    const updated = await this.prisma.trainerProfile.update({
      where: { id: profileId },
      data: {
        status: TrainerStatus.SUSPENDED,
        suspendedUntil: until ?? null,
        rejectionReason: reason,
      },
    });

    this.eventEmitter.emit('trainer.suspended', {
      profileId, userId: profile.userId, reason, until, adminUserId,
    });
    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: reinstate
  // ──────────────────────────────────────────────────────────────────────────
  async adminReinstate(profileId: string, adminUserId: string) {
    const profile = await this.prisma.trainerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Trainer profile not found.');
    if (profile.status !== TrainerStatus.SUSPENDED) {
      throw new BadRequestException('Profile is not currently suspended.');
    }

    const updated = await this.prisma.trainerProfile.update({
      where: { id: profileId },
      data: {
        status: TrainerStatus.APPROVED,
        suspendedUntil: null,
        rejectionReason: null,
      },
    });

    this.eventEmitter.emit('trainer.reinstated', {
      profileId, userId: profile.userId, adminUserId,
    });
    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: compute profile completion
  // ──────────────────────────────────────────────────────────────────────────
  private computeCompletion(profile: any): {
    completionPercent: number;
    missingFields: string[];
    nextStep: string;
  } {
    const certs = profile.certificationsJson as any[] | null;
    const services = profile.servicesJson as any[] | null;
    const hasDeliveryMode = profile.inHomeVisits || profile.ownFacility || profile.virtualSessions;

    const checks = [
      { field: 'bio',            ok: !!profile.bio && profile.bio.length >= 10 },
      { field: 'profilePhoto',   ok: !!profile.profilePhotoUrl },
      { field: 'idFront',        ok: !!profile.idFrontUrl },
      { field: 'idBack',         ok: !!profile.idBackUrl },
      { field: 'certification',  ok: Array.isArray(certs) && certs.length >= 1 },
      { field: 'city',           ok: !!profile.city },
      { field: 'baseLocation',   ok: profile.baseLat != null && profile.baseLng != null },
      { field: 'services',       ok: Array.isArray(services) && services.length >= 1 },
      { field: 'deliveryMode',   ok: hasDeliveryMode },
    ];

    const passing = checks.filter(c => c.ok);
    const missingFields = checks.filter(c => !c.ok).map(c => c.field);
    const completionPercent = Math.round((passing.length / checks.length) * 100);

    const stepMap: Record<string, string> = {
      bio:           'Add a bio to describe your training approach.',
      profilePhoto:  'Upload your profile photo.',
      idFront:       'Upload the front of your national ID.',
      idBack:        'Upload the back of your national ID.',
      certification: 'Upload at least one certification.',
      city:          'Set your city.',
      baseLocation:  'Set your base location on the map.',
      services:      'Add at least one service with pricing.',
      deliveryMode:  'Enable at least one delivery mode (in-home, facility, or virtual).',
    };

    const nextStep = missingFields.length > 0
      ? stepMap[missingFields[0]] ?? `Complete: ${missingFields[0]}`
      : 'Profile complete!';

    return { completionPercent, missingFields, nextStep };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: auto-approve when 100% complete
  // ──────────────────────────────────────────────────────────────────────────
  private async checkAndAutoApprove(userId: string, profile: any) {
    if (profile.status !== TrainerStatus.PENDING_DOCS) return;

    const { completionPercent } = this.computeCompletion(profile);
    if (completionPercent === 100) {
      await this.prisma.trainerProfile.update({
        where: { userId },
        data: {
          status: TrainerStatus.APPROVED,
          autoApprovedAt: new Date(),
        },
      });

      this.eventEmitter.emit('trainer.auto_approved', {
        userId,
        profileId: profile.id,
        autoApprovedAt: new Date(),
      });

      this.logger.log(`Trainer auto-approved: userId=${userId} profileId=${profile.id}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: validate services pricing against PricingBounds
  // ──────────────────────────────────────────────────────────────────────────
  private async validateServicesAgainstBounds(
    services: Array<{ type: string; priceEgp: number }>,
    avgRating: number | null,
    totalSessions: number,
  ) {
    const serviceTypes = services.map(s => s.type);
    const bounds = await this.prisma.pricingBounds.findMany({
      where: { serviceType: { in: serviceTypes } },
    });

    const elite = isEliteTier(avgRating, totalSessions);

    for (const service of services) {
      const bound = bounds.find(b => b.serviceType === service.type);
      if (!bound) continue;

      const maxEgp = elite ? bound.eliteMaxEgp : bound.defaultMaxEgp;

      if (service.priceEgp < bound.minEgp || service.priceEgp > maxEgp) {
        throw new BadRequestException({
          error: 'PRICE_OUT_OF_RANGE',
          message:
            `Price for ${service.type} must be between ${bound.minEgp} and ${maxEgp} EGP ` +
            `(${elite ? 'elite' : 'standard'} tier).`,
          serviceType: service.type,
          min: bound.minEgp,
          max: maxEgp,
          proposed: service.priceEgp,
        });
      }
    }
  }
}
