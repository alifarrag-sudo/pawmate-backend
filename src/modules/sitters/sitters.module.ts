import { Module } from '@nestjs/common';
import { SittersController } from './sitters.controller';
import { SittersService } from './sitters.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SittersController],
  providers: [SittersService],
  exports: [SittersService],
})
export class SittersModule {}
