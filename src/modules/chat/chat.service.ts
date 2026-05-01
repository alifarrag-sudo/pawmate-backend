import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Chat persistence + history.
 *
 * Used by:
 *  - EventsGateway.handleChatMessage (calls persist + asserts membership)
 *  - ChatController.list             (REST history)
 *  - ChatController.markAllRead      (read-receipt update)
 *
 * Authorisation rule: only the booking's parent or the assigned petFriend
 * may read or write messages for a given booking. The service validates
 * this on every entry point — controllers don't repeat the check.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the caller's role on a booking and return it ('parent' or
   * 'provider'). Throws ForbiddenException when the caller is neither;
   * NotFoundException when the booking doesn't exist.
   */
  async assertMembership(
    bookingId: string,
    userId: string,
  ): Promise<{ role: 'parent' | 'provider' }> {
    if (!userId) {
      throw new ForbiddenException({
        error: 'NOT_AUTHENTICATED',
        message: 'Authentication required.',
      });
    }
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, parentId: true, petFriendId: true },
    });
    if (!booking) {
      throw new NotFoundException({
        error: 'BOOKING_NOT_FOUND',
        message: 'Booking not found.',
      });
    }
    if (booking.parentId === userId) return { role: 'parent' };
    if (booking.petFriendId && booking.petFriendId === userId) {
      return { role: 'provider' };
    }
    throw new ForbiddenException({
      error: 'NOT_BOOKING_MEMBER',
      message: 'You are not a member of this booking.',
    });
  }

  /**
   * GET /chat/messages/:bookingId — history (oldest first), capped at
   * `limit` (default 50, max 200). Returns unreadCount calculated for
   * the calling user (messages not authored by them and never read).
   */
  async listMessages(
    bookingId: string,
    userId: string,
    limit = 50,
  ): Promise<{
    messages: any[];
    total: number;
    unreadCount: number;
  }> {
    await this.assertMembership(bookingId, userId);

    const cap = Math.min(Math.max(limit, 1), 200);

    const [messages, total, unreadCount] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'asc' },
        take: cap,
      }),
      this.prisma.chatMessage.count({ where: { bookingId } }),
      this.prisma.chatMessage.count({
        where: {
          bookingId,
          readAt: null,
          NOT: { senderId: userId },
        },
      }),
    ]);

    return { messages, total, unreadCount };
  }

  /**
   * Persist a new message. Called from EventsGateway after the WebSocket
   * client emits `chat:send`. Membership is enforced; the senderRole is
   * derived from the booking and stored verbatim so the chat UI can render
   * sides of conversation without re-resolving the booking on every load.
   */
  async createMessage(
    bookingId: string,
    senderId: string,
    content: string,
  ): Promise<{
    id: string;
    bookingId: string;
    senderId: string;
    senderRole: 'parent' | 'provider';
    content: string;
    createdAt: Date;
  }> {
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException({
        error: 'EMPTY_MESSAGE',
        message: 'Message content is required.',
      });
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException({
        error: 'MESSAGE_TOO_LONG',
        message: 'Messages are limited to 2000 characters.',
      });
    }

    const { role } = await this.assertMembership(bookingId, senderId);

    const created = await this.prisma.chatMessage.create({
      data: {
        bookingId,
        senderId,
        senderRole: role,
        content: trimmed,
      },
    });

    return {
      id: created.id,
      bookingId: created.bookingId,
      senderId: created.senderId,
      senderRole: created.senderRole as 'parent' | 'provider',
      content: created.content,
      createdAt: created.createdAt,
    };
  }

  /**
   * PATCH /chat/messages/:bookingId/read-all — flip all incoming messages
   * (i.e. messages NOT authored by the caller) to readAt = now. Idempotent.
   * Returns the number of rows actually flipped.
   */
  async markAllRead(
    bookingId: string,
    userId: string,
  ): Promise<{ markedRead: number }> {
    await this.assertMembership(bookingId, userId);

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        bookingId,
        readAt: null,
        NOT: { senderId: userId },
      },
      data: { readAt: new Date() },
    });

    return { markedRead: result.count };
  }
}
