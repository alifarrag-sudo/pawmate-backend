import { Module } from '@nestjs/common';
import { WebApplicationController } from './web-application.controller';
import { WebApplicationService } from './web-application.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WebApplicationController],
  providers: [WebApplicationService],
})
export class WebApplicationModule {}
