import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  }) {
    const { lat, lng, serviceType, radiusKm = 10, page = 1, limit = 20 } = params;
    const delta = radiusKm / 111;

    const where: any = {
      isActive: true,
      lat: { gte: lat - delta, lte: lat + delta },
      lng: { gte: lng - delta, lte: lng + delta },
    };

    if (serviceType) {
      where.services = { has: serviceType };
    }

    const [sitters, total] = await Promise.all([
      this.prisma.sitterProfile.findMany({
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
      this.prisma.sitterProfile.count({ where }),
    ]);

    return { sitters, total, page, pages: Math.ceil(total / limit) };
  }
}
