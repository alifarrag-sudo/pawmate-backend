import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

const RATE_FLOOR_EGP = 1;
const RATE_CEILING_EGP = 99_999;

function assertSaneRate(rate: number, fieldName: string): void {
  if (!Number.isFinite(rate) || !Number.isInteger(rate)) {
    throw new BadRequestException({
      error: 'INVALID_RATE',
      message: `Price for ${fieldName} must be a whole-number EGP value`,
    });
  }
  if (rate < RATE_FLOOR_EGP) {
    throw new BadRequestException({
      error: 'INVALID_RATE',
      message: `Price for ${fieldName} must be greater than 0 EGP`,
    });
  }
  if (rate > RATE_CEILING_EGP) {
    throw new BadRequestException({
      error: 'INVALID_RATE',
      message: `Price for ${fieldName} cannot exceed ${RATE_CEILING_EGP} EGP`,
    });
  }
}

const DAY_MAP: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

@Injectable()
export class SittersService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true } },
        availabilityTemplates: true,
      },
    });
    if (!profile) throw new NotFoundException('Sitter not found');

    // Build weeklyTemplate from availability templates
    const weeklyTemplate: Record<string, { isAvailable: boolean }> = {
      mon: { isAvailable: false }, tue: { isAvailable: false }, wed: { isAvailable: false },
      thu: { isAvailable: false }, fri: { isAvailable: false }, sat: { isAvailable: false },
      sun: { isAvailable: false },
    };
    for (const t of profile.availabilityTemplates || []) {
      const key = DAY_MAP[t.dayOfWeek];
      if (key) weeklyTemplate[key] = { isAvailable: true };
    }

    // Fetch reviews via user relation
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: profile.userId, revieweeType: 'petfriend', isPublished: true },
      take: 5,
      orderBy: { submittedAt: 'desc' },
      include: { reviewer: { select: { firstName: true, lastName: true } } },
    });

    // Build per-service pricing summary using the new BOARDING/WALKING/DAY_CARE
    // schema fields. The legacy PricingBounds tier system was removed in the
    // service taxonomy restructure — providers now set their own rates with
    // no platform-enforced caps.
    const p = profile as any;
    const pricing = {
      currency: 'EGP',
      services: {
        BOARDING: {
          perNightEgp: p.boardingPerNightRateEgp ?? null,
          latePickupHourlyEgp: p.boardingLatePickupHourlyEgp ?? null,
        },
        WALKING: {
          perHourEgp: p.walkingPerHourRateEgp ?? null,
          minimumHours: p.walkingMinimumHours ?? 1,
          extraHourlyEgp: p.walkingExtraHourlyRateEgp ?? null,
        },
        DAY_CARE: {
          sixHourEgp: p.daycareSixHourRateEgp ?? null,
          eightHourEgp: p.daycareEightHourRateEgp ?? null,
          latePickupHourlyEgp: p.daycareLatePickupHourlyEgp ?? null,
        },
      },
    };

    return {
      ...profile,
      yearsOfExperience: p.experienceYears,
      maxPets: p.maxPetsPerBooking,
      acceptedSpecies: p.petTypes,
      weeklyTemplate,
      pricing,
      reviews: reviews.map(r => ({
        id: r.id,
        rating: Number(r.overallRating),
        comment: r.comment,
        reviewer: r.reviewer,
        createdAt: r.submittedAt,
      })),
    };
  }

  async findNearby(lat: number, lng: number, radiusKm = 10) {
    // Basic proximity search — will be enhanced with PostGIS
    const delta = radiusKm / 111;
    return this.prisma.petFriendProfile.findMany({
      where: {
        isActive: true,
        lat: { gte: lat - delta, lte: lat + delta },
        lng: { gte: lng - delta, lte: lng + delta },
      },
      include: { user: { select: { firstName: true, lastName: true, profilePhoto: true } } },
      orderBy: { avgRating: 'desc' },
      take: 50,
    });
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true, phone: true } },
        availabilityTemplates: true,
      },
    });
    if (!profile) throw new NotFoundException('Sitter profile not found');
    const p = profile as any;
    return {
      ...profile,
      yearsOfExperience: p.experienceYears,
      maxPetsAtOnce: p.maxPetsPerBooking,
      acceptedSpecies: p.petTypes,
    };
  }

  private mapProfileInput(data: any) {
    const mapped: any = { ...data };
    if ('yearsOfExperience' in data) { mapped.experienceYears = data.yearsOfExperience; delete mapped.yearsOfExperience; }
    if ('maxPetsAtOnce' in data) { mapped.maxPetsPerBooking = data.maxPetsAtOnce; delete mapped.maxPetsAtOnce; }
    if ('acceptedSpecies' in data) { mapped.petTypes = data.acceptedSpecies; delete mapped.acceptedSpecies; }
    // Strip fields not in the SitterProfile schema
    delete mapped.homeEnvironment;
    delete mapped.serviceLocationType;
    return mapped;
  }

  async createProfile(userId: string, data: any) {
    const existing = await this.prisma.petFriendProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Sitter profile already exists');
    const profile = await this.prisma.petFriendProfile.create({
      data: { ...this.mapProfileInput(data), userId },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { isPetFriend: true } });
    this.eventEmitter.emit('provider.applied', { userId, providerType: 'petfriend', profileId: profile.id });
    this.eventEmitter.emit('provider.approved', { userId, providerType: 'petfriend', profileId: profile.id });
    return profile;
  }

  async updateProfile(userId: string, data: any) {
    return this.prisma.petFriendProfile.update({
      where: { userId },
      data: this.mapProfileInput(data),
    });
  }

  /** Replace the sitter's weekly availability template (all days at once) */
  async setWeeklyTemplate(userId: string, days: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    const profile = await this.prisma.petFriendProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Sitter profile not found');

    // Replace all existing templates with the new set
    await this.prisma.petFriendAvailabilityTemplate.deleteMany({ where: { petFriendId: profile.id } });
    if (days.length > 0) {
      await this.prisma.petFriendAvailabilityTemplate.createMany({
        data: days.map(d => ({
          petFriendId: profile.id,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime || '09:00',
          endTime: d.endTime || '18:00',
        })),
      });
    }
    return this.prisma.petFriendAvailabilityTemplate.findMany({ where: { petFriendId: profile.id } });
  }

  async getAvailability(petFriendId: string, date?: string) {
    const profile = await this.prisma.petFriendProfile.findFirst({ where: { id: petFriendId } });
    if (!profile) throw new NotFoundException('Sitter not found');
    const templates = await this.prisma.petFriendAvailabilityTemplate.findMany({
      where: { petFriendId: profile.id },
    });
    return { templates, date };
  }

  async getMyAvailability(userId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Sitter profile not found');
    const templates = await this.prisma.petFriendAvailabilityTemplate.findMany({
      where: { petFriendId: profile.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    return { templates };
  }

  async deleteAvailabilityTemplate(userId: string, templateId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Sitter profile not found');
    const template = await this.prisma.petFriendAvailabilityTemplate.findFirst({
      where: { id: templateId, petFriendId: profile.id },
    });
    if (!template) throw new NotFoundException('Availability template not found');
    await this.prisma.petFriendAvailabilityTemplate.delete({ where: { id: templateId } });
    return { message: 'Availability slot deleted.' };
  }

  // ─── DYNAMIC PRICING ────────────────────────────────────────────────────

  /**
   * Return current per-service rates for a sitter (no platform tier ranges —
   * those were retired with PricingBounds during the service taxonomy
   * restructure).
   */
  async getPricingInfo(petFriendId: string) {
    const profile = await this.prisma.petFriendProfile.findUnique({ where: { id: petFriendId } });
    if (!profile) throw new NotFoundException('Sitter not found');

    const pp = profile as any;
    return {
      currency: 'EGP',
      services: {
        BOARDING: {
          perNightEgp: pp.boardingPerNightRateEgp ?? null,
          latePickupHourlyEgp: pp.boardingLatePickupHourlyEgp ?? null,
        },
        WALKING: {
          perHourEgp: pp.walkingPerHourRateEgp ?? null,
          minimumHours: pp.walkingMinimumHours ?? 1,
          extraHourlyEgp: pp.walkingExtraHourlyRateEgp ?? null,
        },
        DAY_CARE: {
          sixHourEgp: pp.daycareSixHourRateEgp ?? null,
          eightHourEgp: pp.daycareEightHourRateEgp ?? null,
          latePickupHourlyEgp: pp.daycareLatePickupHourlyEgp ?? null,
        },
      },
    };
  }

  /**
   * Legacy entry point. Today this is mapped onto the new pricing fields and
   * sanity-validated (rate > 0 AND rate ≤ 99,999). The old tier-based
   * PricingBounds enforcement was removed.
   */
  async updateServicePricing(userId: string, prices: {
    dog_walking?: number;
    daycare?: number;
    overnight_boarding?: number;
    drop_in?: number;
  }) {
    const profile = await this.prisma.petFriendProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Sitter profile not found');

    for (const [svc, price] of Object.entries(prices)) {
      if (price === undefined || price === null) continue;
      assertSaneRate(price, svc);
    }

    return this.prisma.petFriendProfile.update({
      where: { userId },
      data: {
        dogWalkingPrice:   prices.dog_walking        != null ? prices.dog_walking        : undefined,
        daycarePrice:      prices.daycare             != null ? prices.daycare             : undefined,
        overnightPrice:    prices.overnight_boarding  != null ? prices.overnight_boarding  : undefined,
        dropInVisitPrice:  prices.drop_in             != null ? prices.drop_in             : undefined,
      } as any,
    });
  }
}
