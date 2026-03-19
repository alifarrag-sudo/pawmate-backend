import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis.module';
import { BookingsModule } from '../bookings/bookings.module';
import { MatchingService } from '../bookings/matching.service';
import { PricingService } from '../bookings/pricing.service';

@Module({
  imports: [PrismaModule, RedisModule, BookingsModule],
  providers: [SchedulerService, MatchingService, PricingService],
})
export class SchedulerModule {}
