import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const [totalUsers, totalBookings, activeBookings] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: 'active' } }),
    ]);
    return { totalUsers, totalBookings, activeBookings };
  }
}
