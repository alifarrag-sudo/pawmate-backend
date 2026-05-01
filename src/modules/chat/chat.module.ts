import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * REST chat module. The Socket.IO `chat:send` handler lives on
 * EventsGateway (in TrackingModule); it imports ChatModule to call
 * ChatService.createMessage on each incoming message, persisting before
 * broadcasting.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
