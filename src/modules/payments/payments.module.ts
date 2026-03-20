import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymobService } from './paymob.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymobService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
