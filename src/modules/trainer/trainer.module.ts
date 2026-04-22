import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MailModule } from '../mail/mail.module';
import { TrainerService } from './trainer.service';
import { TrainerController, TrainersSearchController } from './trainer.controller';
import { TrainerAdminController } from './trainer-admin.controller';

@Module({
  imports: [PrismaModule, UploadsModule, MailModule],
  providers: [TrainerService],
  controllers: [TrainerController, TrainersSearchController, TrainerAdminController],
  exports: [TrainerService],
})
export class TrainerModule {}
