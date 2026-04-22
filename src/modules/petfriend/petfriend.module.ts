import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PetFriendService } from './petfriend.service';
import { PetFriendPayoutService } from './petfriend-payout.service';
import { PetFriendController } from './petfriend.controller';
import { PetFriendAdminController } from './petfriend-admin.controller';

@Module({
  imports: [
    PrismaModule,
    UploadsModule,
  ],
  providers: [
    PetFriendService,
    PetFriendPayoutService,
  ],
  controllers: [
    PetFriendController,
    PetFriendAdminController,
  ],
  exports: [
    PetFriendService,
  ],
})
export class PetFriendModule {}
