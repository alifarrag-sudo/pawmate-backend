import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { GroomerService } from './groomer.service';
import { GroomerController } from './groomer.controller';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [GroomerService],
  controllers: [GroomerController],
  exports: [GroomerService],
})
export class GroomerModule {}
