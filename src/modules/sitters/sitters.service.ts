import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MAP: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

@Injectable()
export class SittersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const profile = await this.prisma.sitterProfile.findUnique({
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
      where: { revieweeId: profile.userId, revieweeType: 'sitter', isPublished: true },
      take: 5,
      orderBy: { submittedAt: 'desc' },
      include: { reviewer: { select: { firstName: true, lastName: true } } },
    });

    return {
      ...profile,
      yearsOfExperience: profile.experienceYears,
      maxPets: profile.maxPetsPerBooking,
      acceptedSpecies: profile.petTypes,
      weeklyTemplate,
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
    return this.prisma.sitterProfile.findMany({
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
    const profile = await this.prisma.sitterProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true, phone: true } },
        availabilityTemplates: true,
      },
    });
    if (!profile) throw new NotFoundException('Sitter profile not found');
    return {
      ...profile,
      yearsOfExperience: profile.experienceYears,
      maxPetsAtOnce: profile.maxPetsPerBooking,
      acceptedSpecies: profile.petTypes,
    };
  }

  private mapProfileInput(data: any) {
    const mapped: any = { ...data };
    if ('yearsOfExperience' in data) { mapped.experienceYears = data.yearsOfExperience; delete mapped.yearsOfExperience; }
    if ('maxPetsAtOnce' in data) { mapped.maxPetsPerBooking = data.maxPetsAtOnce; delete mapped.maxPetsAtOnce; }
    if ('acceptedSpecies' in data) { mapped.petTypes = data.acceptedSpecies; delete mapped.acceptedSpecies; }
    // homeEnvironment is not in schema — drop it to avoid Prisma errors
    delete mapped.homeEnvironment;
    return mapped;
  }

  async createProfile(userId: string, data: any) {
    const existing = await this.prisma.sitterProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Sitter profile already exists');
    const profile = await this.prisma.sitterProfile.create({
      data: { ...this.mapProfileInput(data), userId },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { isSitter: true } });
    return profile;
  }

  async updateProfile(userId: string, data: any) {
    return this.prisma.sitterProfile.update({
      where: { userId },
      data: this.mapProfileInput(data),
    });
  }

  async getAvailability(sitterId: string, date?: string) {
    const profile = await this.prisma.sitterProfile.findFirst({ where: { id: sitterId } });
    if (!profile) throw new NotFoundException('Sitter not found');
    const templates = await this.prisma.sitterAvailabilityTemplate.findMany({
      where: { sitterId: profile.id },
    });
    return { templates, date };
  }
}
