import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for ChatService — focus on:
 *   1. Membership enforcement (parent / provider / outsider)
 *   2. Persistence shape returned by createMessage
 *   3. Content validation (empty, too long)
 *   4. listMessages returns history + unreadCount scoped to caller
 *   5. markAllRead only flips messages NOT authored by the caller
 */
describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    booking: { findUnique: jest.Mock };
    chatMessage: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      booking: { findUnique: jest.fn() },
      chatMessage: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ── Membership ────────────────────────────────────────────────────

  describe('assertMembership', () => {
    it('returns role=parent when caller is the booking parent', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        petFriendId: 'sitter-1',
      });
      const r = await service.assertMembership('b1', 'parent-1');
      expect(r.role).toBe('parent');
    });

    it('returns role=provider when caller is the petFriend', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        petFriendId: 'sitter-1',
      });
      const r = await service.assertMembership('b1', 'sitter-1');
      expect(r.role).toBe('provider');
    });

    it('throws ForbiddenException for outsiders', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent-1',
        petFriendId: 'sitter-1',
      });
      await expect(service.assertMembership('b1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(service.assertMembership('missing', 'parent-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when userId is missing', async () => {
      await expect(service.assertMembership('b1', '')).rejects.toThrow(ForbiddenException);
      // Prisma should not be hit
      expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── createMessage ─────────────────────────────────────────────────

  describe('createMessage', () => {
    const baseBooking = {
      id: 'b1',
      parentId: 'parent-1',
      petFriendId: 'sitter-1',
    };

    it('persists a message with senderRole derived from booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.chatMessage.create.mockResolvedValue({
        id: 'm1',
        bookingId: 'b1',
        senderId: 'parent-1',
        senderRole: 'parent',
        content: 'hi sitter',
        createdAt: new Date('2026-05-01T10:00:00Z'),
      });

      const r = await service.createMessage('b1', 'parent-1', '  hi sitter  ');

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'b1',
          senderId: 'parent-1',
          senderRole: 'parent',
          content: 'hi sitter', // trimmed
        },
      });
      expect(r.senderRole).toBe('parent');
      expect(r.content).toBe('hi sitter');
    });

    it('rejects empty / whitespace-only content (BadRequest)', async () => {
      await expect(service.createMessage('b1', 'parent-1', '   ')).rejects.toThrow(
        BadRequestException,
      );
      // Booking lookup short-circuits — content validation happens first
      expect(prisma.booking.findUnique).not.toHaveBeenCalled();
    });

    it('rejects content > 2000 chars', async () => {
      const long = 'x'.repeat(2001);
      await expect(service.createMessage('b1', 'parent-1', long)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects outsiders (Forbidden)', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      await expect(
        service.createMessage('b1', 'someone-else', 'hello'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });
  });

  // ── listMessages ─────────────────────────────────────────────────

  describe('listMessages', () => {
    const baseBooking = {
      id: 'b1',
      parentId: 'parent-1',
      petFriendId: 'sitter-1',
    };

    it('returns history (oldest first) + total + unreadCount scoped to caller', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      const rows = [
        { id: 'm1', content: 'hi', senderId: 'sitter-1', readAt: null },
        { id: 'm2', content: 'hey', senderId: 'parent-1', readAt: null },
      ];
      prisma.chatMessage.findMany.mockResolvedValue(rows);
      prisma.chatMessage.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(1); // unreadCount (only m1 is from sitter, unread by parent)

      const r = await service.listMessages('b1', 'parent-1');

      expect(r.messages).toEqual(rows);
      expect(r.total).toBe(2);
      expect(r.unreadCount).toBe(1);
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bookingId: 'b1' },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
      );
    });

    it('clamps limit to 200', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.chatMessage.findMany.mockResolvedValue([]);
      prisma.chatMessage.count.mockResolvedValue(0);

      await service.listMessages('b1', 'parent-1', 9999);

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('throws Forbidden for outsiders before hitting findMany', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(
        service.listMessages('b1', 'someone-else'),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });
  });

  // ── markAllRead ──────────────────────────────────────────────────

  describe('markAllRead', () => {
    const baseBooking = {
      id: 'b1',
      parentId: 'parent-1',
      petFriendId: 'sitter-1',
    };

    it('flips only messages NOT authored by the caller', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });

      const r = await service.markAllRead('b1', 'parent-1');

      expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
        where: {
          bookingId: 'b1',
          readAt: null,
          NOT: { senderId: 'parent-1' },
        },
        data: { readAt: expect.any(Date) },
      });
      expect(r.markedRead).toBe(3);
    });

    it('throws Forbidden for outsiders', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(service.markAllRead('b1', 'foreign')).rejects.toThrow(ForbiddenException);

      expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    });

    it('idempotent: returns 0 when nothing was unread', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.chatMessage.updateMany.mockResolvedValue({ count: 0 });

      const r = await service.markAllRead('b1', 'parent-1');
      expect(r).toEqual({ markedRead: 0 });
    });
  });
});
