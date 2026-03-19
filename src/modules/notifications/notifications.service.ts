import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: admin.app.App;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // Initialize Firebase Admin SDK (only if real credentials are configured)
    const firebaseKey = config.get('FIREBASE_PRIVATE_KEY');
    const firebaseReady = firebaseKey && !firebaseKey.startsWith('your-');
    if (firebaseReady) {
      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.get('FIREBASE_PROJECT_ID'),
            privateKey: firebaseKey.replace(/\\n/g, '\n'),
            clientEmail: config.get('FIREBASE_CLIENT_EMAIL'),
          }),
        });
      } else {
        this.firebaseApp = admin.app();
      }
    } else {
      this.logger.warn('Firebase not configured — push notifications disabled');
    }
  }

  // ============================================================
  // EVENT LISTENERS (booking lifecycle)
  // ============================================================

  @OnEvent('booking.created')
  async onBookingCreated({ booking, sitter }: any) {
    await this.sendPushToUser(sitter.id, {
      title: 'New Booking Request',
      body: `You have a new ${booking.serviceType.replace('_', ' ')} request. Respond within 10 minutes!`,
      data: { type: 'booking_request', bookingId: booking.id },
    });
    await this.saveNotification(sitter.id, 'booking_request', 'New Booking Request',
      `You have a new ${booking.serviceType.replace('_', ' ')} request. Respond within 10 minutes!`,
      { bookingId: booking.id });
  }

  @OnEvent('booking.accepted')
  async onBookingAccepted({ booking, sitterId }: any) {
    const sitter = await this.prisma.user.findUnique({
      where: { id: sitterId },
      select: { firstName: true, lastName: true },
    });
    const name = sitter ? `${sitter.firstName} ${sitter.lastName.charAt(0)}.` : 'Your sitter';

    await this.sendPushToUser(booking.ownerId, {
      title: '🎉 Booking Confirmed!',
      body: `${name} accepted your booking. See you soon!`,
      data: { type: 'booking_accepted', bookingId: booking.id },
    });
    await this.saveNotification(booking.ownerId, 'booking_accepted', 'Booking Confirmed!',
      `${name} accepted your booking.`, { bookingId: booking.id });
  }

  @OnEvent('booking.declined')
  async onBookingDeclined({ booking, sitterId }: any) {
    // Don't notify owner here — MatchingService will route to next sitter
    // Owner only notified if no sitters available
  }

  @OnEvent('booking.noSittersAvailable')
  async onNoSittersAvailable({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: 'No Sitters Available',
      body: 'No available sitters found for your request. Try a different time or expand your search area.',
      data: { type: 'no_sitters', bookingId: booking.id },
    });
  }

  @OnEvent('booking.started')
  async onBookingStarted({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: '✅ Service Started',
      body: 'Your sitter has started the service. Track care activities in real-time.',
      data: { type: 'booking_started', bookingId: booking.id },
    });
  }

  @OnEvent('booking.ended')
  async onBookingEnded({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: '🏁 Service Ended',
      body: 'The service has ended. Please confirm to release payment.',
      data: { type: 'booking_ended', bookingId: booking.id },
    });
  }

  @OnEvent('booking.cancelled')
  async onBookingCancelled({ booking, cancelledBy, cancellationType }: any) {
    const notifyUserId = cancelledBy === 'owner' ? booking.sitterId : booking.ownerId;
    const message = cancelledBy === 'owner'
      ? 'The owner has cancelled this booking.'
      : 'The sitter has cancelled this booking. You will receive a full refund.';

    await this.sendPushToUser(notifyUserId, {
      title: 'Booking Cancelled',
      body: message,
      data: { type: 'booking_cancelled', bookingId: booking.id },
    });
  }

  @OnEvent('walk.started')
  async onWalkStarted({ sessionId, ownerId }: any) {
    await this.sendPushToUser(ownerId, {
      title: '🐾 Walk Started!',
      body: 'Your pet\'s walk has begun. Tap to track live.',
      data: { type: 'walk_started', sessionId },
    });
  }

  @OnEvent('walk.ended')
  async onWalkEnded({ task, stats, ownerId }: any) {
    await this.sendPushToUser(ownerId, {
      title: '🏡 Walk Complete!',
      body: `Walk finished: ${(stats.distanceM / 1000).toFixed(1)}km in ${Math.round(stats.durationSeconds / 60)} minutes.`,
      data: { type: 'walk_ended', bookingId: task?.bookingId },
    });
  }

  // ============================================================
  // CORE METHODS
  // ============================================================

  async sendPushToUser(userId: string, notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId, isActive: true, fcmToken: { not: null } },
      select: { fcmToken: true, id: true },
    });

    if (devices.length === 0) return;

    for (const device of devices) {
      if (!device.fcmToken) continue;
      try {
        if (!this.firebaseApp) continue;
        await this.firebaseApp.messaging().send({
          token: device.fcmToken,
          notification: { title: notification.title, body: notification.body },
          data: notification.data,
          android: { priority: 'high', notification: { sound: 'default', channelId: 'pawmate_default' } },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });
      } catch (err: any) {
        if (err.code === 'messaging/registration-token-not-registered') {
          // Token is invalid — remove it
          await this.prisma.userDevice.update({
            where: { id: device.id },
            data: { isActive: false },
          });
        } else {
          this.logger.error(`Push notification failed for device ${device.id}: ${err.message}`);
        }
      }
    }
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const apiKey = this.config.get('VONAGE_API_KEY');
    const apiSecret = this.config.get('VONAGE_API_SECRET');
    const from = this.config.get('VONAGE_FROM_NUMBER', 'PawMate');

    if (this.config.get('NODE_ENV') === 'development') {
      this.logger.debug(`[DEV SMS to ${phone}]: ${message}`);
      return;
    }

    try {
      await axios.post('https://rest.nexmo.com/sms/json', {
        api_key: apiKey,
        api_secret: apiSecret,
        to: phone.replace('+', ''),
        from,
        text: message,
        type: 'text',
      });
    } catch (error: any) {
      this.logger.error(`SMS send failed to ${phone}: ${error.message}`);
      // Don't throw — SMS failure should not break the main flow
    }
  }

  async saveNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, title, body, data },
    });
  }

  async getNotifications(userId: string, page = 1, limit = 20) {
    const [notifications, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      items: notifications,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), unreadCount },
    };
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
