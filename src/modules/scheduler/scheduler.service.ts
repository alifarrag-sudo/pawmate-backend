import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchingService } from '../bookings/matching.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notifications: NotificationsService,
    private matching: MatchingService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================================
  // Every minute: Check for expired pending bookings
  // ============================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async checkBookingTimeouts() {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

    const expiredBookings = await this.prisma.booking.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      take: 50, // Process in batches
    });

    for (const booking of expiredBookings) {
      // Atomic claim with Redis to prevent double-processing
      const claimed = await this.redis.set(
        `booking:timeout:${booking.id}`,
        'processing',
        'NX',
        120,
      );

      if (claimed !== 'OK') continue; // Another process claimed it

      this.logger.log(`Processing timeout for booking ${booking.id}`);
      await this.matching.routeBookingToNextSitter(booking.id);
    }
  }

  // ============================================================
  // Every minute: Auto-complete bookings awaiting owner confirmation (2h window)
  // ============================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAutoComplete() {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    const bookingsToComplete = await this.prisma.booking.findMany({
      where: {
        status: 'completed',
        actualEnd: { lt: cutoff },
        paymentStatus: 'authorized',
      },
      take: 50,
    });

    for (const booking of bookingsToComplete) {
      this.logger.log(`Auto-confirming booking ${booking.id}`);
      this.eventEmitter.emit('booking.confirmed', { booking });
    }
  }

  // ============================================================
  // Every 30 minutes: Close orphaned walk sessions
  // ============================================================
  @Cron('0 */30 * * * *')
  async closeOrphanedWalkSessions() {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago

    const orphanedSessions = await this.prisma.walkSession.findMany({
      where: {
        isComplete: false,
        startTime: { lt: cutoff },
      },
    });

    for (const session of orphanedSessions) {
      this.logger.warn(`Closing orphaned walk session ${session.id}`);

      const endTime = new Date();
      const durationSeconds = Math.floor(
        (endTime.getTime() - session.startTime.getTime()) / 1000,
      );

      await this.prisma.walkSession.update({
        where: { id: session.id },
        data: { isComplete: true, endTime, durationSeconds },
      });

      // Notify sitter and owner
      const task = await this.prisma.bookingTask.findUnique({
        where: { id: session.taskId },
        include: { booking: { select: { ownerId: true } } },
      });

      if (task) {
        await this.notifications.sendPushToUser(session.sitterId, {
          title: 'Walk Session Auto-Closed',
          body: 'Your walk session was automatically closed after 3 hours.',
          data: { type: 'walk_auto_closed', sessionId: session.id },
        });
        await this.notifications.sendPushToUser(task.booking.ownerId, {
          title: 'Walk Session Auto-Closed',
          body: 'The walk session was automatically closed.',
          data: { type: 'walk_auto_closed', sessionId: session.id },
        });
      }
    }
  }

  // ============================================================
  // Daily at 3:00 AM: Vaccination expiry reminders
  // ============================================================
  @Cron('0 0 3 * * *')
  async checkVaccinationExpiry() {
    this.logger.log('Running vaccination expiry check...');

    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find vaccinations expiring in 30 days
    const expiring30 = await this.prisma.petVaccination.findMany({
      where: {
        expiryDate: {
          gte: today,
          lte: in30Days,
        },
      },
      include: {
        pet: { include: { owner: { select: { id: true, firstName: true } } } },
      },
    });

    for (const vacc of expiring30) {
      const daysLeft = Math.floor(
        (new Date(vacc.expiryDate!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const urgency = daysLeft <= 7 ? '⚠️ URGENT: ' : '';

      await this.notifications.sendPushToUser(vacc.pet.owner.id, {
        title: `${urgency}Vaccination Reminder`,
        body: `${vacc.pet.name}'s ${vacc.vaccineName} vaccination expires in ${daysLeft} day(s).`,
        data: { type: 'vaccination_reminder', petId: vacc.petId },
      });

      await this.notifications.saveNotification(
        vacc.pet.owner.id,
        'vaccination_reminder',
        `${urgency}Vaccination Reminder`,
        `${vacc.pet.name}'s ${vacc.vaccineName} expires in ${daysLeft} day(s).`,
        { petId: vacc.petId, vaccId: vacc.id },
      );
    }

    this.logger.log(`Vaccination reminders sent: ${expiring30.length}`);
  }

  // ============================================================
  // Every 15 minutes: Recalculate sitter performance metrics
  // ============================================================
  @Cron('0 */15 * * * *')
  async refreshSitterMetrics() {
    // Find sitters who had reviews published in the last 15 minutes
    const since = new Date(Date.now() - 15 * 60 * 1000);

    const recentlyReviewedSitters = await this.prisma.review.findMany({
      where: {
        revieweeType: 'sitter',
        isPublished: true,
        publishedAt: { gte: since },
      },
      select: { revieweeId: true },
      distinct: ['revieweeId'],
    });

    for (const { revieweeId } of recentlyReviewedSitters) {
      await this.recalculateSitterMetrics(revieweeId);
    }
  }

  // ============================================================
  // Daily at 2:00 AM: Auto-publish reviews at 14-day mark
  // ============================================================
  @Cron('0 0 2 * * *')
  async autoPublishExpiredReviews() {
    const now = new Date();

    // Publish reviews where deadline has passed and at least one party submitted
    const bookingsWithPendingReviews = await this.prisma.booking.findMany({
      where: {
        reviewDeadline: { lt: now },
        OR: [{ ownerReviewed: true }, { sitterReviewed: true }],
      },
      include: {
        reviews: { where: { isPublished: false } },
      },
    });

    for (const booking of bookingsWithPendingReviews) {
      if (booking.reviews.length > 0) {
        await this.prisma.review.updateMany({
          where: { bookingId: booking.id, isPublished: false },
          data: { isPublished: true, publishedAt: now },
        });
        this.logger.log(`Auto-published reviews for booking ${booking.id}`);
      }
    }
  }

  // ============================================================
  // Every 5 minutes: Task reminders for active bookings
  // ============================================================
  @Cron('0 */5 * * * *')
  async sendTaskReminders() {
    const now = new Date();
    const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

    // Find tasks coming up in the next 5 minutes that haven't sent reminders
    const upcomingTasks = await this.prisma.bookingTask.findMany({
      where: {
        status: 'pending',
        scheduledAt: { gte: now, lte: in5Minutes },
        booking: { status: 'active' },
      },
      include: {
        booking: { select: { sitterId: true, ownerId: true } },
        pet: { select: { name: true } },
      },
    });

    for (const task of upcomingTasks) {
      await this.notifications.sendPushToUser(task.booking.sitterId, {
        title: `Upcoming Task: ${task.taskName}`,
        body: `${task.taskName} is scheduled in 5 minutes.`,
        data: { type: 'task_reminder', taskId: task.id, bookingId: task.bookingId },
      });
    }

    // Check for overdue tasks (past due_by)
    const overdueTasks = await this.prisma.bookingTask.findMany({
      where: {
        status: 'pending',
        dueBy: { lt: now },
        alertSentOwner: false,
        booking: { status: 'active' },
      },
      include: {
        booking: { select: { ownerId: true, sitterId: true } },
        pet: { select: { name: true } },
      },
    });

    for (const task of overdueTasks) {
      const isUrgent = task.taskType === 'medication';

      await this.notifications.sendPushToUser(task.booking.ownerId, {
        title: isUrgent ? '⚠️ Urgent: Missed Task!' : 'Task Overdue',
        body: `${task.taskName} for ${task.pet?.name || 'your pet'} was not completed on time.`,
        data: { type: 'task_overdue', taskId: task.id, bookingId: task.bookingId },
      });

      await this.prisma.bookingTask.update({
        where: { id: task.id },
        data: { alertSentOwner: true },
      });
    }
  }

  // ============================================================
  // Every 5 minutes: Refresh sitter availability index in Redis
  // ============================================================
  @Cron('0 */5 * * * *')
  async refreshAvailabilityIndex() {
    await this.matching.refreshAvailabilityIndex();
  }

  // ============================================================
  // HELPER: Recalculate sitter metrics
  // ============================================================
  private async recalculateSitterMetrics(sitterUserId: string): Promise<void> {
    const profile = await this.prisma.sitterProfile.findUnique({
      where: { userId: sitterUserId },
    });
    if (!profile) return;

    // Get last 50 published reviews
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: sitterUserId, revieweeType: 'sitter', isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });

    if (reviews.length === 0) return;

    // Weighted average (more recent reviews count more)
    const totalWeight = reviews.reduce((sum, _, i) => sum + (50 - i), 0);
    const weightedRating = reviews.reduce(
      (sum, r, i) => sum + Number(r.overallRating) * (50 - i),
      0,
    );
    const avgRating = weightedRating / totalWeight;

    // Reliability: completed bookings / total accepted bookings
    const totalBookings = await this.prisma.booking.count({
      where: { sitterId: sitterUserId, status: { in: ['completed', 'cancelled'] } },
    });
    const completedBookings = await this.prisma.booking.count({
      where: { sitterId: sitterUserId, status: 'completed' },
    });
    const reliabilityScore = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 100;

    await this.prisma.sitterProfile.update({
      where: { id: profile.id },
      data: {
        avgRating: Number(avgRating.toFixed(2)),
        totalReviews: reviews.length,
        totalBookings: completedBookings,
        reliabilityScore: Number(reliabilityScore.toFixed(2)),
      },
    });
  }
}
