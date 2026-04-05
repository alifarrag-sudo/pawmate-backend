import { Module } from '@nestjs/common';
import { CareLogService } from './care-log.service';
import { CareLogController } from './care-log.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CareLogService],
  controllers: [CareLogController],
  exports: [CareLogService],
})
export class CareLogModule {}
