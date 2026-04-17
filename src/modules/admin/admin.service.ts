import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getDashboardStats() {
    const [totalUsers, totalBookings, activeBookings] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: 'active' } }),
    ]);
    return { totalUsers, totalBookings, activeBookings };
  }

  async banUser(userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, banReason: reason },
    });

    // FIX 4: Immediately invalidate the JWT guard cache so the ban takes effect on next request
    await this.redis.del(`user:active:${userId}`);

    return { message: 'User banned successfully.' };
  }

  async unbanUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, banReason: null },
    });

    await this.redis.del(`user:active:${userId}`);

    return { message: 'User unbanned successfully.' };
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });

    // FIX 4: Immediately invalidate the JWT guard cache
    await this.redis.del(`user:active:${userId}`);

    return { message: 'User soft-deleted successfully.' };
  }
}
