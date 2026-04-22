import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { isCommunityEnabled } from '../../common/feature-flags';

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
      data: { type: 'booking_request', bookingId: booking.id, target_role: 'PETFRIEND', deep_link: `/booking/${booking.id}` },
    });
    await this.saveNotification(sitter.id, 'booking_request', 'New Booking Request',
      `You have a new ${booking.serviceType.replace('_', ' ')} request. Respond within 10 minutes!`,
      { bookingId: booking.id }, 'PETFRIEND', `/booking/${booking.id}`);
  }

  @OnEvent('booking.accepted')
  async onBookingAccepted({ booking, petFriendId }: any) {
    const sitter = await this.prisma.user.findUnique({
      where: { id: petFriendId },
      select: { firstName: true, lastName: true },
    });
    const name = sitter ? `${sitter.firstName} ${sitter.lastName.charAt(0)}.` : 'Your sitter';

    await this.sendPushToUser(booking.ownerId, {
      title: '🎉 Booking Confirmed!',
      body: `${name} accepted your booking. See you soon!`,
      data: { type: 'booking_accepted', bookingId: booking.id, target_role: 'PARENT', deep_link: `/booking/${booking.id}` },
    });
    await this.saveNotification(booking.ownerId, 'booking_accepted', 'Booking Confirmed!',
      `${name} accepted your booking.`, { bookingId: booking.id }, 'PARENT', `/booking/${booking.id}`);
  }

  @OnEvent('booking.declined')
  async onBookingDeclined({ booking, petFriendId }: any) {
    // Don't notify owner here — MatchingService will route to next sitter
    // Owner only notified if no sitters available
  }

  @OnEvent('booking.noSittersAvailable')
  async onNoSittersAvailable({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: 'No Sitters Available',
      body: 'No available sitters found for your request. Try a different time or expand your search area.',
      data: { type: 'no_sitters', bookingId: booking.id, target_role: 'PARENT' },
    });
  }

  @OnEvent('booking.started')
  async onBookingStarted({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: '✅ Service Started',
      body: 'Your sitter has started the service. Track care activities in real-time.',
      data: { type: 'booking_started', bookingId: booking.id, target_role: 'PARENT', deep_link: `/booking/${booking.id}` },
    });
  }

  @OnEvent('booking.ended')
  async onBookingEnded({ booking }: any) {
    await this.sendPushToUser(booking.ownerId, {
      title: '🏁 Service Ended',
      body: 'The service has ended. Please confirm to release payment.',
      data: { type: 'booking_ended', bookingId: booking.id, target_role: 'PARENT', deep_link: `/booking/${booking.id}` },
    });
  }

  @OnEvent('booking.cancelled')
  async onBookingCancelled({ booking, cancelledBy, cancellationType }: any) {
    const notifyUserId = cancelledBy === 'owner' ? booking.petFriendId : booking.ownerId;
    const targetRole = cancelledBy === 'owner' ? 'PETFRIEND' : 'PARENT';
    const message = cancelledBy === 'owner'
      ? 'The owner has cancelled this booking.'
      : 'The sitter has cancelled this booking. You will receive a full refund.';

    await this.sendPushToUser(notifyUserId, {
      title: 'Booking Cancelled',
      body: message,
      data: { type: 'booking_cancelled', bookingId: booking.id, target_role: targetRole, deep_link: `/booking/${booking.id}` },
    });
  }

  @OnEvent('walk.started')
  async onWalkStarted({ sessionId, ownerId }: any) {
    await this.sendPushToUser(ownerId, {
      title: '🐾 Walk Started!',
      body: 'Your pet\'s walk has begun. Tap to track live.',
      data: { type: 'walk_started', sessionId, target_role: 'PARENT' },
    });
  }

  @OnEvent('walk.ended')
  async onWalkEnded({ task, stats, ownerId }: any) {
    await this.sendPushToUser(ownerId, {
      title: '🏡 Walk Complete!',
      body: `Walk finished: ${(stats.distanceM / 1000).toFixed(1)}km in ${Math.round(stats.durationSeconds / 60)} minutes.`,
      data: { type: 'walk_ended', bookingId: task?.bookingId, target_role: 'PARENT' },
    });
  }

  // ============================================================
  // ADOPTION & CAUSES EVENTS
  // ============================================================

  @OnEvent('adoption.message')
  async onAdoptionMessage({ receiverId, senderName, petName, postId }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(receiverId, {
      title: '💬 New Adoption Message',
      body: `${senderName} sent you a message about ${petName}.`,
      data: { type: 'adoption_message', postId },
    });
    await this.saveNotification(receiverId, 'adoption_message', '💬 New Adoption Message',
      `${senderName} sent you a message about ${petName}.`, { postId });
  }

  @OnEvent('cause.donated')
  async onCauseDonated({ creatorId, donorName, amount, causeTitle, causeId }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: '💛 New Donation!',
      body: `${donorName} donated ${amount} EGP to "${causeTitle}".`,
      data: { type: 'cause_donated', causeId },
    });
    await this.saveNotification(creatorId, 'cause_donated', '💛 New Donation!',
      `${donorName} donated ${amount} EGP to "${causeTitle}".`, { causeId });
  }

  @OnEvent('cause.updated')
  async onCauseUpdated({ causeId, causeTitle, updateText, donorIds }: any) {
    if (!isCommunityEnabled()) return;
    for (const donorId of donorIds) {
      await this.sendPushToUser(donorId, {
        title: '📢 Cause Update',
        body: `"${causeTitle}" has a new update.`,
        data: { type: 'cause_updated', causeId },
      });
      await this.saveNotification(donorId, 'cause_updated', '📢 Cause Update',
        `"${causeTitle}": ${updateText.slice(0, 80)}`, { causeId });
    }
  }

  @OnEvent('cause.goal_reached')
  async onCauseGoalReached({ cause, creatorId }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: '🎉 Goal Reached!',
      body: `Your cause "${cause.title}" has reached its funding goal!`,
      data: { type: 'cause_goal_reached', causeId: cause.id },
    });
    await this.saveNotification(creatorId, 'cause_goal_reached', '🎉 Goal Reached!',
      `"${cause.title}" reached its goal. Contact support to arrange withdrawal.`, { causeId: cause.id });
  }

  @OnEvent('cause.approved')
  async onCauseApproved({ causeId, creatorId, title }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: '✅ Cause Approved!',
      body: `Your cause "${title}" is now live and accepting donations.`,
      data: { type: 'cause_approved', causeId },
    });
    await this.saveNotification(creatorId, 'cause_approved', '✅ Cause Approved!',
      `"${title}" is now live.`, { causeId });
  }

  @OnEvent('cause.rejected')
  async onCauseRejected({ causeId, creatorId, title, reason }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: 'Cause Not Approved',
      body: `Your cause "${title}" was not approved. Reason: ${reason || 'See app for details.'}`,
      data: { type: 'cause_rejected', causeId },
    });
    await this.saveNotification(creatorId, 'cause_rejected', 'Cause Not Approved',
      `"${title}": ${reason || 'Contact support for details.'}`, { causeId });
  }

  @OnEvent('withdrawal.requested')
  async onWithdrawalRequested({ causeId, causeTitle, amount, requestId }: any) {
    if (!isCommunityEnabled()) return;
    // Notify all admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await this.sendPushToUser(admin.id, {
        title: '💸 Withdrawal Request',
        body: `${amount} EGP withdrawal requested for "${causeTitle}".`,
        data: { type: 'withdrawal_requested', causeId, requestId },
      });
    }
  }

  @OnEvent('withdrawal.approved')
  async onWithdrawalApproved({ creatorId, amount, causeTitle }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: '✅ Withdrawal Approved',
      body: `Your withdrawal of ${amount} EGP from "${causeTitle}" has been approved. Transfer within 48 hours.`,
      data: { type: 'withdrawal_approved', causeTitle },
    });
    await this.saveNotification(creatorId, 'withdrawal_approved', '✅ Withdrawal Approved',
      `${amount} EGP from "${causeTitle}" — transfer within 48h.`, { causeTitle });
  }

  @OnEvent('withdrawal.rejected')
  async onWithdrawalRejected({ creatorId, amount, causeTitle, reason }: any) {
    if (!isCommunityEnabled()) return;
    await this.sendPushToUser(creatorId, {
      title: 'Withdrawal Not Approved',
      body: `Your withdrawal of ${amount} EGP from "${causeTitle}" was rejected.`,
      data: { type: 'withdrawal_rejected', causeTitle },
    });
    await this.saveNotification(creatorId, 'withdrawal_rejected', 'Withdrawal Not Approved',
      reason || 'Contact support for details.', { causeTitle });
  }

  // ============================================================
  // EVENT LISTENERS (food marketplace)
  // ============================================================

  @OnEvent('food.order_placed')
  async onFoodOrderPlaced({ orderId, sellerUserId, buyerName, totalAmount, pickupSlot }: any) {
    await this.sendPushToUser(sellerUserId, {
      title: '🍖 New Food Order!',
      body: `${buyerName} ordered ${totalAmount} EGP — pickup: ${pickupSlot}. Confirm within 1 hour.`,
      data: { type: 'food_order_placed', orderId },
    });
    await this.saveNotification(sellerUserId, 'food_order_placed', '🍖 New Food Order!',
      `${buyerName} — ${totalAmount} EGP. Pickup: ${pickupSlot}`, { orderId });
  }

  @OnEvent('food.order_confirmed')
  async onFoodOrderConfirmed({ orderId, buyerId }: any) {
    await this.sendPushToUser(buyerId, {
      title: '✅ Order Confirmed!',
      body: 'Your food order has been confirmed by the seller. Get ready for pickup!',
      data: { type: 'food_order_confirmed', orderId },
    });
    await this.saveNotification(buyerId, 'food_order_confirmed', '✅ Order Confirmed!',
      'Your food order was confirmed. Pickup details in your order.', { orderId });
  }

  @OnEvent('food.order_rejected')
  async onFoodOrderRejected({ orderId, buyerId, reason, totalAmount }: any) {
    await this.sendPushToUser(buyerId, {
      title: 'Order Cancelled',
      body: `Your food order was cancelled. ${totalAmount} EGP refunded to your wallet.`,
      data: { type: 'food_order_rejected', orderId },
    });
    await this.saveNotification(buyerId, 'food_order_rejected', 'Order Cancelled',
      reason || `Refund of ${totalAmount} EGP sent to your wallet.`, { orderId });
  }

  @OnEvent('food.order_ready')
  async onFoodOrderReady({ orderId, buyerId }: any) {
    await this.sendPushToUser(buyerId, {
      title: '🛍️ Order Ready for Pickup!',
      body: 'Your order is packed and waiting. Head over to pick it up!',
      data: { type: 'food_order_ready', orderId },
    });
    await this.saveNotification(buyerId, 'food_order_ready', '🛍️ Order Ready for Pickup!',
      'Your food order is ready. Go pick it up now!', { orderId });
  }

  @OnEvent('food.order_picked_up')
  async onFoodOrderPickedUp({ orderId, sellerUserId, sellerEarning }: any) {
    await this.sendPushToUser(sellerUserId, {
      title: '💰 Payment Received!',
      body: `${sellerEarning} EGP has been added to your wallet. Order complete!`,
      data: { type: 'food_order_picked_up', orderId },
    });
    await this.saveNotification(sellerUserId, 'food_order_picked_up', '💰 Payment Received!',
      `${sellerEarning} EGP added to wallet. Thanks for selling on PawMate!`, { orderId });
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
    targetRole: string = 'ANY',
    deepLink?: string,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, title, body, data, targetRole, deepLink },
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
