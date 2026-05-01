import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Map a serviceType (BOARDING / WALKING / DAY_CARE / legacy lowercase) to the
 * PetFriendProfile column that holds its rate. Used to apply a maxPrice filter
 * scoped to the service the user is searching for.
 */
function rateColumnForServiceType(serviceType: string | undefined): string | null {
  if (!serviceType) return null;
  const upper = serviceType.toUpperCase();
  if (upper === 'BOARDING' || upper === 'OVERNIGHT_STAY') return 'boardingPerNightRateEgp';
  if (upper === 'WALKING' || upper === 'DOG_WALKING') return 'walkingPerHourRateEgp';
  // For DAY_CARE we filter on the cheaper 6-hour rate.
  if (upper === 'DAY_CARE' || upper === 'PET_WATCHING_HOURLY' || upper === 'PET_WATCHING_DAILY') {
    return 'daycareSixHourRateEgp';
  }
  return null;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async searchSitters(params: {
    lat: number;
    lng: number;
    serviceType?: string;
    radiusKm?: number;
    page?: number;
    limit?: number;
    maxPrice?: number;
  }) {
    const { lat, lng, serviceType, radiusKm = 10, page = 1, limit = 20, maxPrice } = params;
    const delta = radiusKm / 111;

    const where: any = {
      isActive: true,
      lat: { gte: lat - delta, lte: lat + delta },
      lng: { gte: lng - delta, lte: lng + delta },
    };

    if (serviceType) {
      where.servicesOffered = { has: serviceType };
    }

    if (maxPrice != null && Number.isFinite(maxPrice)) {
      const col = rateColumnForServiceType(serviceType);
      if (col) {
        where[col] = { lte: maxPrice };
      }
    }

    const [sitters, total] = await Promise.all([
      this.prisma.petFriendProfile.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, profilePhoto: true, idVerified: true },
          },
        },
        orderBy: [{ avgRating: 'desc' }, { totalReviews: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.petFriendProfile.count({ where }),
    ]);

    return { sitters, total, page, pages: Math.ceil(total / limit) };
  }

  async findNearbySitters(params: {
    lat: number;
    lng: number;
    radiusKm?: number;
    serviceType?: string;
    limit?: number;
    maxPrice?: number;
  }) {
    const { lat, lng, radiusKm = 10, serviceType, limit = 20, maxPrice } = params;
    // Bounding box pre-filter (cheap SQL), then haversine for accurate distance
    const delta = radiusKm / 111;

    const where: any = {
      isActive: true,
      lat: { gte: lat - delta, lte: lat + delta },
      lng: { gte: lng - delta, lte: lng + delta },
    };
    if (serviceType) {
      where.servicesOffered = { has: serviceType };
    }
    if (maxPrice != null && Number.isFinite(maxPrice)) {
      const col = rateColumnForServiceType(serviceType);
      if (col) {
        where[col] = { lte: maxPrice };
      }
    }

    const candidates = await this.prisma.petFriendProfile.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true, idVerified: true } },
      },
      take: limit * 5, // fetch extra, trim after haversine filter
    });

    const withDistance = candidates
      .map((s) => ({
        ...s,
        distanceKm: haversineKm(lat, lng, Number(s.lat), Number(s.lng)),
      }))
      .filter((s) => s.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return { sitters: withDistance, total: withDistance.length, radiusKm };
  }
}
