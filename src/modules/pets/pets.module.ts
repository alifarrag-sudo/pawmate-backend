import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PetsController, AdminPetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [PrismaModule, UploadsModule, CryptoModule, EventEmitterModule],
  controllers: [PetsController, AdminPetsController],
  providers: [PetsService],
  exports: [PetsService],
})
export class PetsModule {}
