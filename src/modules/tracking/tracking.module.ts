import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { FraudDetectionService } from './fraud.service';
import { EventsGateway } from './events.gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../common/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [TrackingController],
  providers: [TrackingService, FraudDetectionService, EventsGateway],
  exports: [TrackingService, EventsGateway],
})
export class TrackingModule {}
