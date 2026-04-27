import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VetService } from './vet.service';
import { VetController } from './vet.controller';
import { ConsultationService } from './consultation.service';
import { PrescriptionService } from './prescription.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [VetService, ConsultationService, PrescriptionService],
  controllers: [VetController],
  exports: [VetService, ConsultationService, PrescriptionService],
})
export class VetModule {}
