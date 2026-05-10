import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MeetGreetController } from './meet-greet.controller';
import { MeetGreetService } from './meet-greet.service';

@Module({
  imports: [PrismaModule],
  controllers: [MeetGreetController],
  providers: [MeetGreetService],
  exports: [MeetGreetService],
})
export class MeetGreetModule {}
