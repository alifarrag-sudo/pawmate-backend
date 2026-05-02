import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for the read-side methods on NotificationsService:
 *   - getNotifications  (list + total + unreadCount, paginated)
 *   - getUnreadCount    (cheap badge endpoint)
 *   - markAllAsRead     (returns count of rows flipped, idempotent)
 *
 * Push delivery and event listeners are intentionally out of scope —
 * those rely on Firebase + EventEmitter and live in integration tests.
 */
describe('NotificationsService — list / unread-count / mark-read', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      // Tests pass an array of Promise-like values; resolve them in order.
      $transaction: jest.fn((promises: Promise<any>[]) => Promise.all(promises)),
    };

    const config = {
      // Returning undefined for FIREBASE_PRIVATE_KEY skips Firebase init
      // and avoids touching firebase-admin in unit tests.
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  // ── getNotifications ─────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns the canonical shape: notifications + total + unreadCount', async () => {
      const rows = [
        { id: 'n1', isRead: false },
        { id: 'n2', isRead: true },
      ];
      prisma.notification.findMany.mockResolvedValue(rows);
      prisma.notification.count
        .mockResolvedValueOnce(2) // total
        .mockResolvedValueOnce(1); // unreadCount

      const r = await service.getNotifications('user-1');

      expect(r.notifications).toEqual(rows);
      expect(r.total).toBe(2);
      expect(r.unreadCount).toBe(1);
      expect(r.page).toBe(1);
      expect(r.totalPages).toBe(1);
    });

    it('paginates correctly (page=2, limit defaults to 20)', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.getNotifications('user-1', 2);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
          skip: 20,
          take: 20,
        }),
      );
    });

    it('scopes both counts to the requested userId', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.getNotifications('user-2');

      // First count = total for user-2; second = unread for user-2.
      const calls = prisma.notification.count.mock.calls;
      expect(calls[0][0]).toEqual({ where: { userId: 'user-2' } });
      expect(calls[1][0]).toEqual({ where: { userId: 'user-2', isRead: false } });
    });
  });

  // ── getUnreadCount ──────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('returns { count } and only counts unread rows for the caller', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const r = await service.getUnreadCount('user-1');

      expect(r).toEqual({ count: 7 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });

    it('returns 0 when nothing is unread', async () => {
      prisma.notification.count.mockResolvedValue(0);
      const r = await service.getUnreadCount('user-1');
      expect(r).toEqual({ count: 0 });
    });
  });

  // ── markAllAsRead ───────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('flips only unread rows and returns the count', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });

      const r = await service.markAllAsRead('user-1');

      expect(r).toEqual({ markedRead: 4 });
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it('idempotent: returns 0 when nothing was unread', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.markAllAsRead('user-1');
      expect(r).toEqual({ markedRead: 0 });
    });
  });
});
