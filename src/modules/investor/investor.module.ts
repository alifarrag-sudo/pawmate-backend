import { Module } from '@nestjs/common';
import { InvestorController } from './investor.controller';
import { InvestorService } from './investor.service';
import { InvestorGuard } from './investor.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../../common/redis.module';

@Module({
  imports: [PrismaModule, MailModule, RedisModule],
  controllers: [InvestorController],
  providers: [InvestorService, InvestorGuard],
})
export class InvestorModule {}
