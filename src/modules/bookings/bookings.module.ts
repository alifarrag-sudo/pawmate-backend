import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, MatchingService, PricingService],
  exports: [BookingsService],
})
export class BookingsModule {}
