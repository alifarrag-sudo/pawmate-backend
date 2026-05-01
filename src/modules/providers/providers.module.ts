import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { OperatorService } from './operator.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [PrismaModule, BusinessModule],
  controllers: [ProvidersController],
  providers: [ProvidersService, OperatorService],
  exports: [ProvidersService, OperatorService],
})
export class ProvidersModule {}
