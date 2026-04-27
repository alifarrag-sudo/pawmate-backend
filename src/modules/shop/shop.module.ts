import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { VisionService } from './vision.service';
import { SafetyService } from './safety.service';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [ShopService, VisionService, SafetyService, OrderService],
  controllers: [ShopController],
  exports: [ShopService, VisionService, SafetyService, OrderService],
})
export class ShopModule {}
