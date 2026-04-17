// DEFERRED: Community feature — reintroduce post-launch
import { Module } from '@nestjs/common';
import { CausesController } from './causes.controller';
import { CausesService } from './causes.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CausesController],
  providers: [CausesService],
  exports: [CausesService],
})
export class CausesModule {}
