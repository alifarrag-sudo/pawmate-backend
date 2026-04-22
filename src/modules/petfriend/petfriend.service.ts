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
import { UpdatePetFriendProfileDto } from './petfriend.dto';
import { PetFriendStatus, ProviderPayoutMethod } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const INSTANT_CASHOUT_FEE_RATE = 0.03;   // 3%
const INSTANT_CASHOUT_MIN_EGP  = 100;    // Minimum 100 EGP to request instant cashout
const ELITE_MIN_RATING          = 4.5;
const ELITE_MIN_BOOKINGS        = 20;
const COMMISSION_ELITE          = 0.10;
const COMMISSION_DEFAULT        = 0.15;

// Document fields that live on User vs PetFriendProfile
type DocumentField =
  | 'idFrontUrl'
  | 'idBackUrl'
  | 'pccUrl'
  | 'selfieWithIdUrl'
  | 'profilePhotoUrl';

// Which fields belong to the User table vs the PetFriendProfile table
const USER_DOC_FIELDS   = new Set<DocumentField>(['idFrontUrl', 'idBackUrl', 'profilePhotoUrl']);
const PROFILE_DOC_FIELDS = new Set<DocumentField>(['pccUrl', 'selfieWithIdUrl']);

// Cloudinary folder for petfriend documents
const DOC_FOLDER = 'id_documents' as const;
const PHOTO_FOLDER = 'profile_photos' as const;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isEliteTier(avgRating: number, totalBookings: number): boolean {
  return avgRating >= ELITE_MIN_RATING && totalBookings >= ELITE_MIN_BOOKINGS;
}

function resolveCommissionRate(avgRating: number, totalBookings: number): number {
  return isEliteTier(avgRating, totalBookings) ? COMMISSION_ELITE : COMMISSION_DEFAULT;
}

// ──────────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PetFriendService {
  private readonly logger = new Logger(PetFriendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mail: MailService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Apply — creates profile shell; idempotent via ConflictException
  // ──────────────────────────────────────────────────────────────────────────
  async applyForPetFriend(userId: string) {
    const existing = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('PetFriend profile already exists for this account.');
    }

    const profile = await this.prisma.petFriendProfile.create({
      data: {
        userId,
        status: PetFriendStatus.PENDING_DOCS,
        appliedAt: new Date(),
        commissionRate: COMMISSION_DEFAULT,
      },
    });

    // Add PETFRIEND to user.roles[] (immutable push via Prisma push)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        roles: { push: 'PETFRIEND' },
        isPetFriend: true,
      },
    });

    this.eventEmitter.emit('petfriend.applied', {
      userId,
      profileId: profile.id,
      appliedAt: profile.appliedAt,
    });

    return { profileId: profile.id, status: profile.status };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Update profile fields (incrementally builds toward 100% completion)
  // ──────────────────────────────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdatePetFriendProfileDto) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found. Apply first.');
    }

    if (profile.status === PetFriendStatus.SUSPENDED) {
      throw new ForbiddenException('Cannot update profile while suspended.');
    }

    // Validate rates against PricingBounds if any rate is being changed
    const rateChanges = this.extractRateChanges(dto);
    if (Object.keys(rateChanges).length > 0) {
      await this.validateRatesAgainstBounds(
        rateChanges,
        Number(profile.avgRating),
        profile.totalBookings,
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.bio              !== undefined) updateData.bio              = dto.bio;
    if (dto.servicesOffered  !== undefined) updateData.servicesOffered  = dto.servicesOffered;
    if (dto.acceptsDogs      !== undefined) updateData.acceptsDogs      = dto.acceptsDogs;
    if (dto.acceptsCats      !== undefined) updateData.acceptsCats      = dto.acceptsCats;
    if (dto.acceptsOther     !== undefined) updateData.acceptsOther     = dto.acceptsOther;
    if (dto.maxPetsPerBooking !== undefined) updateData.maxPetsPerBooking = dto.maxPetsPerBooking;
    if (dto.maxDogSizeKg     !== undefined) updateData.maxDogSizeKg     = dto.maxDogSizeKg;
    if (dto.ratePerHour      !== undefined) updateData.ratePerHour      = dto.ratePerHour;
    if (dto.ratePerDay       !== undefined) updateData.ratePerDay       = dto.ratePerDay;
    if (dto.ratePerNight     !== undefined) updateData.ratePerNight     = dto.ratePerNight;
    if (dto.ratePerWalk      !== undefined) updateData.ratePerWalk      = dto.ratePerWalk;
    if (dto.city             !== undefined) updateData.addressCity      = dto.city;
    if (dto.neighborhoods    !== undefined) updateData.addressDistrict  = dto.neighborhoods;
    if (dto.serviceRadiusKm  !== undefined) updateData.serviceRadiusKm  = dto.serviceRadiusKm;
    if (dto.baseLat          !== undefined) updateData.lat              = dto.baseLat;
    if (dto.baseLng          !== undefined) updateData.lng              = dto.baseLng;
    if (dto.homeType         !== undefined) updateData.homeType         = dto.homeType;
    if (dto.hasYard          !== undefined) updateData.hasYard          = dto.hasYard;
    if (dto.availabilityJson !== undefined) updateData.availabilityJson = dto.availabilityJson;
    if (dto.payoutMethodJson !== undefined) updateData.payoutMethodJson = dto.payoutMethodJson;

    const updated = await this.prisma.petFriendProfile.update({
      where: { userId },
      data: updateData as any,
    });

    // Check if profile is now complete — trigger auto-approval
    await this.checkAndAutoApprove(userId, updated);

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Upload a document and store the URL on the correct model
  // ──────────────────────────────────────────────────────────────────────────
  async uploadDocument(
    userId: string,
    field: DocumentField,
    fileBuffer: Buffer,
    mimeType: string,
  ) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found. Apply first.');
    }

    const folder = field === 'profilePhotoUrl' ? PHOTO_FOLDER : DOC_FOLDER;
    const result = await this.uploads.uploadImage(fileBuffer, folder, { maxWidth: 1200 });

    if (USER_DOC_FIELDS.has(field)) {
      // Map DTO field name to User column name
      const userFieldMap: Record<string, string> = {
        idFrontUrl:    'idFrontUrl',
        idBackUrl:     'idBackUrl',
        profilePhotoUrl: 'profilePhoto',
      };
      const dbField = userFieldMap[field];
      await this.prisma.user.update({
        where: { id: userId },
        data: { [dbField]: result.url },
      });
    } else if (PROFILE_DOC_FIELDS.has(field)) {
      await this.prisma.petFriendProfile.update({
        where: { userId },
        data: { [field]: result.url },
      });
    }

    // Re-fetch updated profile and check completion
    const updatedProfile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (updatedProfile) {
      await this.checkAndAutoApprove(userId, updatedProfile);
    }

    return { field, url: result.url, publicId: result.publicId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Get my profile with completion stats
  // ──────────────────────────────────────────────────────────────────────────
  async getMyProfile(userId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profilePhoto: true,
            idFrontUrl: true,
            idBackUrl: true,
            email: true,
            phone: true,
            roles: true,
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    const { completionPercent, missingFields, nextStep } =
      this.computeCompletion(profile, (profile as any).user);

    return {
      ...profile,
      completionPercent,
      missingFields,
      nextStep,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Get public profile (safe subset — no PCC, balances, or payout info)
  // ──────────────────────────────────────────────────────────────────────────
  async getPublicProfile(profileId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            profilePhoto: true,
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }
    if (profile.status !== PetFriendStatus.APPROVED) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    // Return only public-safe fields
    return {
      id: profile.id,
      user: profile.user,
      bio: profile.bio,
      homeType: profile.homeType,
      hasYard: profile.hasYard,
      servicesOffered: profile.servicesOffered,
      acceptsDogs: profile.acceptsDogs,
      acceptsCats: profile.acceptsCats,
      acceptsOther: profile.acceptsOther,
      maxPetsPerBooking: profile.maxPetsPerBooking,
      maxDogSizeKg: profile.maxDogSizeKg,
      ratePerHour: profile.ratePerHour,
      ratePerDay: profile.ratePerDay,
      ratePerNight: profile.ratePerNight,
      ratePerWalk: profile.ratePerWalk,
      addressCity: profile.addressCity,
      addressDistrict: profile.addressDistrict,
      serviceRadiusKm: profile.serviceRadiusKm,
      lat: profile.lat,
      lng: profile.lng,
      avgRating: profile.avgRating,
      totalReviews: profile.totalReviews,
      totalBookings: profile.totalBookings,
      responseRate: profile.responseRate,
      reliabilityScore: profile.reliabilityScore,
      isVerified: profile.isVerified,
      isFeatured: profile.isFeatured,
      instantBook: profile.instantBook,
      availabilityJson: profile.availabilityJson,
      createdAt: profile.createdAt,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Calculate commission breakdown for a given booking amount
  // ──────────────────────────────────────────────────────────────────────────
  async calculateCommission(profileId: string, bookingAmountEgp: number) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
      select: { avgRating: true, totalBookings: true, commissionRate: true },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    const commissionRate = resolveCommissionRate(
      Number(profile.avgRating),
      profile.totalBookings,
    );
    const commissionEgp = Math.round(bookingAmountEgp * commissionRate);
    const netEgp        = bookingAmountEgp - commissionEgp;

    return { commissionRate, commissionEgp, netEgp };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Increment earnings after booking completion
  // ──────────────────────────────────────────────────────────────────────────
  async incrementEarnings(
    profileId: string,
    netEgp: number,
    bookingId: string,
  ) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        pendingBalanceEgp: true,
        totalEarnedEgp: true,
        totalBookings: true,
        avgRating: true,
        commissionRate: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    const newTotalBookings = profile.totalBookings + 1;
    const newCommissionRate = resolveCommissionRate(
      Number(profile.avgRating),
      newTotalBookings,
    );

    const updated = await this.prisma.petFriendProfile.update({
      where: { id: profileId },
      data: {
        pendingBalanceEgp: { increment: netEgp },
        totalEarnedEgp:    { increment: netEgp },
        totalBookings:     { increment: 1 },
        commissionRate:    newCommissionRate,
      },
    });

    this.logger.log(
      `Earnings incremented for profile ${profileId}: +${netEgp} EGP from booking ${bookingId}`,
    );

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Instant cashout — 2% fee, minimum 100 EGP
  // ──────────────────────────────────────────────────────────────────────────
  async instantCashout(userId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        availableBalanceEgp: true,
        pendingBalanceEgp: true,
        payoutMethodJson: true,
        status: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }
    if (profile.status !== PetFriendStatus.APPROVED) {
      throw new ForbiddenException('Only approved PetFriends can request payouts.');
    }

    const available = profile.availableBalanceEgp;
    if (available < INSTANT_CASHOUT_MIN_EGP) {
      throw new BadRequestException(
        `Minimum balance for instant cashout is ${INSTANT_CASHOUT_MIN_EGP} EGP. Current available: ${available} EGP.`,
      );
    }

    const feeEgp = Math.ceil(available * INSTANT_CASHOUT_FEE_RATE);
    const netEgp = available - feeEgp;

    const payout = await this.prisma.petFriendPayout.create({
      data: {
        petFriendId:          userId,
        petFriendProfileId:   profile.id,
        amount:               available,
        payoutMethod:         ProviderPayoutMethod.bank_transfer,
        status:               'pending',
        type:                 'INSTANT',
        netEgp,
        instantCashoutFeeEgp: feeEgp,
        requestedAt:          new Date(),
        scheduledFor:         new Date(), // Process immediately
      },
    });

    // Deduct from available balance
    await this.prisma.petFriendProfile.update({
      where: { id: profile.id },
      data: { availableBalanceEgp: { decrement: available } },
    });

    this.eventEmitter.emit('payout.instant_requested', {
      userId,
      profileId: profile.id,
      payoutId:  payout.id,
      amount:    available,
      feeEgp,
      netEgp,
    });

    return { payoutId: payout.id, amount: available, feeEgp, netEgp, status: payout.status };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: list profiles pending manual review
  // ──────────────────────────────────────────────────────────────────────────
  async adminListPendingReview() {
    return this.prisma.petFriendProfile.findMany({
      where: { status: PetFriendStatus.ADMIN_REVIEW },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            idFrontUrl: true,
            idBackUrl: true,
          },
        },
      },
      orderBy: { appliedAt: 'asc' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: approve or reject a profile
  // ──────────────────────────────────────────────────────────────────────────
  async adminReview(
    profileId: string,
    action: 'approve' | 'reject',
    reason: string | undefined,
    adminUserId: string,
  ) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    if (action === 'reject' && !reason) {
      throw new BadRequestException('A rejection reason is required.');
    }

    const newStatus =
      action === 'approve' ? PetFriendStatus.APPROVED : PetFriendStatus.REJECTED;

    const updated = await this.prisma.petFriendProfile.update({
      where: { id: profileId },
      data: {
        status:           newStatus,
        adminReviewedAt:  new Date(),
        adminReviewedBy:  adminUserId,
        rejectionReason:  action === 'reject' ? reason : null,
        isActive:         action === 'approve',
      },
    });

    const eventName =
      action === 'approve' ? 'petfriend.admin_approved' : 'petfriend.rejected';

    this.eventEmitter.emit(eventName, {
      profileId,
      userId: profile.userId,
      action,
      reason,
      adminUserId,
    });

    if (action === 'reject') {
      this.prisma.user.findUnique({
        where: { id: profile.userId },
        select: { email: true, firstName: true },
      }).then(user => {
        if (user) {
          return this.mail.sendPetFriendRejection(user, reason);
        }
      }).catch(e => this.logger.warn(`sendPetFriendRejection failed: ${e.message}`));
    }

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: suspend a profile
  // ──────────────────────────────────────────────────────────────────────────
  async adminSuspend(
    profileId: string,
    reason: string,
    until: Date | undefined,
    adminUserId: string,
  ) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }

    const updated = await this.prisma.petFriendProfile.update({
      where: { id: profileId },
      data: {
        status:         PetFriendStatus.SUSPENDED,
        suspendedUntil: until ?? null,
        isActive:       false,
        rejectionReason: reason,
      },
    });

    this.eventEmitter.emit('petfriend.suspended', {
      profileId,
      userId: profile.userId,
      reason,
      until,
      adminUserId,
    });

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: reinstate a suspended profile
  // ──────────────────────────────────────────────────────────────────────────
  async adminReinstate(profileId: string, adminUserId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('PetFriend profile not found.');
    }
    if (profile.status !== PetFriendStatus.SUSPENDED) {
      throw new BadRequestException('Profile is not currently suspended.');
    }

    const updated = await this.prisma.petFriendProfile.update({
      where: { id: profileId },
      data: {
        status:         PetFriendStatus.APPROVED,
        suspendedUntil: null,
        rejectionReason: null,
        isActive:       true,
      },
    });

    this.eventEmitter.emit('petfriend.reinstated', {
      profileId,
      userId: profile.userId,
      adminUserId,
    });

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: compute profile completion percentage + missing fields
  // ──────────────────────────────────────────────────────────────────────────
  private computeCompletion(
    profile: any,
    user: any,
  ): { completionPercent: number; missingFields: string[]; nextStep: string } {
    const checks: Array<{ field: string; ok: boolean }> = [
      { field: 'bio',             ok: !!profile.bio && profile.bio.length >= 10 },
      { field: 'profilePhoto',    ok: !!user?.profilePhoto },
      { field: 'idFrontUrl',      ok: !!user?.idFrontUrl },
      { field: 'idBackUrl',       ok: !!user?.idBackUrl },
      { field: 'pccUrl',          ok: !!profile.pccUrl },
      { field: 'selfieWithIdUrl', ok: !!profile.selfieWithIdUrl },
      { field: 'servicesOffered', ok: Array.isArray(profile.servicesOffered) && profile.servicesOffered.length > 0 },
      {
        field: 'atLeastOneRate',
        ok:
          profile.ratePerHour  != null ||
          profile.ratePerDay   != null ||
          profile.ratePerNight != null ||
          profile.ratePerWalk  != null,
      },
      { field: 'city',            ok: !!profile.addressCity },
    ];

    const passing      = checks.filter(c => c.ok);
    const missingFields = checks.filter(c => !c.ok).map(c => c.field);
    const completionPercent = Math.round((passing.length / checks.length) * 100);

    let nextStep = 'Profile complete!';
    if (missingFields.length > 0) {
      const first = missingFields[0];
      const stepMap: Record<string, string> = {
        bio:             'Add a bio to introduce yourself to pet owners.',
        profilePhoto:    'Upload your profile photo.',
        idFrontUrl:      'Upload the front of your national ID.',
        idBackUrl:       'Upload the back of your national ID.',
        pccUrl:          'Upload your Police Clearance Certificate (PCC).',
        selfieWithIdUrl: 'Upload a selfie holding your national ID.',
        servicesOffered: 'Select at least one service you offer.',
        atLeastOneRate:  'Set at least one service rate (hourly, daily, nightly, or per-walk).',
        city:            'Set your service city.',
      };
      nextStep = stepMap[first] ?? `Complete: ${first}`;
    }

    return { completionPercent, missingFields, nextStep };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: auto-approve when profile reaches 100% completion
  // ──────────────────────────────────────────────────────────────────────────
  private async checkAndAutoApprove(userId: string, profile: any) {
    // Only auto-approve profiles that are still in PENDING_DOCS state
    if (profile.status !== PetFriendStatus.PENDING_DOCS) {
      return;
    }

    // Need to fetch user data for completion check
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profilePhoto: true, idFrontUrl: true, idBackUrl: true },
    });

    const { completionPercent } = this.computeCompletion(profile, user);

    if (completionPercent === 100) {
      await this.prisma.petFriendProfile.update({
        where: { userId },
        data: {
          status:          PetFriendStatus.APPROVED,
          autoApprovedAt:  new Date(),
          isActive:        true,
          isVerified:      true,
        },
      });

      this.eventEmitter.emit('petfriend.auto_approved', {
        userId,
        profileId: profile.id,
        autoApprovedAt: new Date(),
      });

      this.logger.log(`PetFriend auto-approved: userId=${userId} profileId=${profile.id}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: extract only rate-related fields from DTO
  // ──────────────────────────────────────────────────────────────────────────
  private extractRateChanges(dto: UpdatePetFriendProfileDto): Record<string, number> {
    const changes: Record<string, number> = {};
    if (dto.ratePerHour  != null) changes.HOUR  = dto.ratePerHour;
    if (dto.ratePerDay   != null) changes.DAY   = dto.ratePerDay;
    if (dto.ratePerNight != null) changes.NIGHT = dto.ratePerNight;
    if (dto.ratePerWalk  != null) changes.WALK  = dto.ratePerWalk;
    return changes;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: validate proposed rates against PricingBounds in DB
  // ──────────────────────────────────────────────────────────────────────────
  private async validateRatesAgainstBounds(
    rateChanges: Record<string, number>,
    avgRating: number,
    totalBookings: number,
  ) {
    const serviceTypes = Object.keys(rateChanges);
    const bounds = await this.prisma.pricingBounds.findMany({
      where: { serviceType: { in: serviceTypes } },
    });

    const elite = isEliteTier(avgRating, totalBookings);

    for (const [serviceType, proposedRate] of Object.entries(rateChanges)) {
      const bound = bounds.find(b => b.serviceType === serviceType);
      if (!bound) continue; // No bound configured for this service type — skip

      const maxEgp = elite ? bound.eliteMaxEgp : bound.defaultMaxEgp;

      if (proposedRate < bound.minEgp || proposedRate > maxEgp) {
        throw new BadRequestException({
          error: 'PRICE_OUT_OF_RANGE',
          message:
            `Rate for ${serviceType} must be between ${bound.minEgp} and ${maxEgp} EGP ` +
            `(${elite ? 'elite' : 'standard'} tier).`,
          serviceType,
          min: bound.minEgp,
          max: maxEgp,
          proposed: proposedRate,
        });
      }
    }
  }
}
