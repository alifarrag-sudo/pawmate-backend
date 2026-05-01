import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

/**
 * REST surface for chat history + read receipts.
 *
 * Real-time send is over Socket.IO (`chat:send` in EventsGateway). REST
 * here is read-only history (what the mobile loads when the chat screen
 * opens) plus a read-all endpoint the mobile calls on open to clear the
 * unread badge.
 */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('messages/:bookingId')
  @ApiOperation({ summary: 'Message history for a booking (oldest first).' })
  list(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.listMessages(bookingId, req.user?.id, limit ? +limit : 50);
  }

  @Patch('messages/:bookingId/read-all')
  @ApiOperation({ summary: 'Mark all incoming messages on this booking as read.' })
  markAllRead(@Request() req: any, @Param('bookingId') bookingId: string) {
    return this.chat.markAllRead(bookingId, req.user?.id);
  }
}
