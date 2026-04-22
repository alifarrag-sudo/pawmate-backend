import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [HealthController],
})
export class HealthModule {}
