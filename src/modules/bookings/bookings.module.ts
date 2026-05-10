import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis.module';
import { CareLogModule } from '../care-log/care-log.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProvidersModule } from '../providers/providers.module';
import { LmsModule } from '../lms/lms.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CareLogModule,
    PricingModule,
    ProvidersModule, // exports OperatorService for /bookings/operator
    LmsModule,       // exports LmsService for the training-required gate
  ],
  controllers: [BookingsController],
  providers: [BookingsService, MatchingService, PricingService],
  exports: [BookingsService],
})
export class BookingsModule {}
