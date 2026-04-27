import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PetHotelService } from './pethotel.service';
import { PetHotelController } from './pethotel.controller';
import { DepositService } from './deposit.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [PetHotelService, DepositService],
  controllers: [PetHotelController],
  exports: [PetHotelService, DepositService],
})
export class PetHotelModule {}
