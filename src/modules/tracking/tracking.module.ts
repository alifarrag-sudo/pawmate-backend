import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { FraudDetectionService } from './fraud.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [TrackingController],
  providers: [TrackingService, FraudDetectionService],
  exports: [TrackingService],
})
export class TrackingModule {}
