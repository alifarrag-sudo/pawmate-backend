import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BusinessService } from './business.service';
import {
  BusinessController,
  TeamController,
  BusinessesSearchController,
} from './business.controller';
import { BusinessAdminController } from './business-admin.controller';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [BusinessService],
  controllers: [
    BusinessController,
    TeamController,
    BusinessesSearchController,
    BusinessAdminController,
  ],
  exports: [BusinessService],
})
export class BusinessModule {}
