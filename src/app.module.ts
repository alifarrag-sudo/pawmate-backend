import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SittersModule } from './modules/sitters/sitters.module';
import { PetsModule } from './modules/pets/pets.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SocialModule } from './modules/social/social.module';
import { AdminModule } from './modules/admin/admin.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Event emitter for domain events (booking.accepted, etc.)
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
    }),

    // CRON job scheduling
    ScheduleModule.forRoot(),

    // Redis-based job queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get('REDIS_URL');
        const redisConfig = redisUrl
          ? { url: redisUrl }
          : {
              host: configService.get('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6379),
              password: configService.get('REDIS_PASSWORD'),
              tls: configService.get('REDIS_TLS') === 'true' ? {} : undefined,
            };
        return {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Rate limiting — global protection
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },    // 10 req/sec per IP
      { name: 'medium', ttl: 60000, limit: 100 },  // 100 req/min per IP
    ]),

    // Prisma ORM
    PrismaModule,

    // File uploads (global — available to all modules)
    UploadsModule,

    // Feature modules
    AuthModule,
    UsersModule,
    SittersModule,
    PetsModule,
    SearchModule,
    BookingsModule,
    TrackingModule,
    PaymentsModule,
    ReviewsModule,
    NotificationsModule,
    SocialModule,
    AdminModule,
    SchedulerModule,
  ],
})
export class AppModule {}
