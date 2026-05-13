import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SittersModule } from './modules/sitters/sitters.module';
import { PetsModule } from './modules/pets/pets.module';
import { LmsModule } from './modules/lms/lms.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { ChatModule } from './modules/chat/chat.module';
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
import { EventBridgeModule } from './modules/events/event-bridge.module';
import { PetFriendModule } from './modules/petfriend/petfriend.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { TrainerModule } from './modules/trainer/trainer.module';
import { BusinessModule } from './modules/business/business.module';
import { KennelModule } from './modules/kennel/kennel.module';
import { PetHotelModule } from './modules/pethotel/pethotel.module';
import { ShopModule } from './modules/shop/shop.module';
// Vet clinic module (Prompt 15 — PDPL encrypted medical records)
import { CryptoModule } from './modules/crypto/crypto.module';
import { VetModule } from './modules/vet/vet.module';
// Groomer module (Prompt 16 — grooming salon/mobile van)
import { GroomerModule } from './modules/groomer/groomer.module';
// Meet & Greet (G2 — observe-only consent for BOARDING/DAY_CARE)
import { MeetGreetModule } from './modules/meet-greet/meet-greet.module';
// Web platform modules (PawMateHub web — Prompt 10.5)
import { SupportModule } from './modules/support/support.module';
import { InvestorModule } from './modules/investor/investor.module';
import { WebApplicationModule } from './modules/web-application/web-application.module';
// Sandbox mode — friends-and-family testing harness (SANDBOX_MODE=true)
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Event emitter for domain events (booking.accepted, etc.)
    EventEmitterModule.forRoot({
      wildcard: true,
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
    LmsModule,
    SearchModule,
    BookingsModule,
    TrackingModule,
    ChatModule,
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
    EventBridgeModule,
    PetFriendModule,
    AnalyticsModule,
    ReferralsModule,
    TrainerModule,
    BusinessModule,
    KennelModule,
    PetHotelModule,
    ShopModule,
    // Medical encryption (global — Prompt 15)
    CryptoModule,
    VetModule,
    GroomerModule,
    MeetGreetModule,
    // Web platform modules
    SupportModule,
    InvestorModule,
    WebApplicationModule,
    // SANDBOX_MODE feature-flag harness
    SandboxModule,
  ],
  providers: [
    // Global rate-limit guard — applies ThrottlerModule config to every route
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
