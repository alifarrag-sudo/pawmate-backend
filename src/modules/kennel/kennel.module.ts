import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { KennelService } from './kennel.service';
import { KennelController } from './kennel.controller';
import { VaccinationCheckService } from './vaccination-check.service';
import { WaiverService } from './waiver.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [KennelService, VaccinationCheckService, WaiverService],
  controllers: [KennelController],
  exports: [KennelService, VaccinationCheckService, WaiverService],
})
export class KennelModule {}
