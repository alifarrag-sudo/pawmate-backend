import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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
import { CareLogModule } from './modules/care-log/care-log.module';
import { OffersModule } from './modules/offers/offers.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { AdoptionModule } from './modules/adoption/adoption.module';
import { CausesModule } from './modules/causes/causes.module';
import { FoodModule } from './modules/food/food.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';

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
    CareLogModule,
    OffersModule,
    ProvidersModule,
    AdoptionModule,
    CausesModule,
    FoodModule,
    HealthModule,
    MailModule,
  ],
})
export class AppModule {}
