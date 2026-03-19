import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        profilePhoto: true,
        isOwner: true,
        isSitter: true,
        activeRole: true,
        loyaltyTier: true,
        walletBalance: true,
        language: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        profilePhoto: true,
        activeRole: true,
        isOwner: true,
        isSitter: true,
        idVerified: true,
        walletBalance: true,
        language: true,
        role: true,
        loyaltyTier: true,
        loyaltyPoints: true,
      },
    });
  }

  async updateMe(userId: string, data: { firstName?: string; lastName?: string; email?: string; language?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: data as any,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        language: true,
        activeRole: true,
        isOwner: true,
        isSitter: true,
      },
    });
  }

  async switchRole(userId: string, activeRole: 'owner' | 'sitter') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (activeRole === 'sitter' && !user?.isSitter) {
      throw new BadRequestException('You are not registered as a sitter');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { activeRole: activeRole as any },
      select: { id: true, activeRole: true },
    });
  }

  async getNotifications(userId: string, page = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;
    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications, total, page, pages: Math.ceil(total / limit) };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  async updateProfilePhoto(userId: string, buffer: Buffer): Promise<{ profilePhoto: string }> {
    const result = await this.uploads.uploadImage(buffer, 'profile_photos', { maxWidth: 400, quality: 85 });
    await this.prisma.user.update({
      where: { id: userId },
      data: { profilePhoto: result.url },
    });
    return { profilePhoto: result.url };
  }

  async registerFcmToken(userId: string, fcmToken: string, deviceType: 'ios' | 'android'): Promise<void> {
    // Deactivate any existing record for this exact token (handles re-registration)
    await this.prisma.userDevice.updateMany({
      where: { userId, fcmToken },
      data: { isActive: false },
    });
    await this.prisma.userDevice.create({
      data: {
        userId,
        fcmToken,
        deviceType: deviceType as any,
        isActive: true,
      },
    });
  }
}
