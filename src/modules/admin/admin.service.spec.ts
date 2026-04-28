import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let redis: any;
  let events: any;

  beforeEach(async () => {
    prisma = {
      booking: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalPrice: null, commissionAmount: null, refundAmount: null },
          _avg: { totalPrice: null },
          _count: 0,
        }),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      petFriendProfile: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _avg: { avgRating: null },
        }),
      },
      petFriendPayout: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: null },
        }),
      },
    };

    redis = {
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    events = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── getLiveMetrics ──────────────────────────────────────────────────────────

  describe('getLiveMetrics', () => {
    it('should return correct shape with bookingsToday, activeStays, etc.', async () => {
      // Arrange
      prisma.booking.count
        .mockResolvedValueOnce(12) // bookingsToday
        .mockResolvedValueOnce(5); // activeStays
      prisma.booking.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 15000 } }) // revenueToday
        .mockResolvedValueOnce({ _avg: { totalPrice: 500 } })   // avg platform (not used directly but called)
        .mockResolvedValueOnce({ _sum: { totalPrice: 120000 } }); // gmvThisMonth
      prisma.petFriendProfile.count
        .mockResolvedValueOnce(30)  // activeProviders
        .mockResolvedValueOnce(3)   // suspendedProviders
        .mockResolvedValueOnce(2);  // lowRatingProviders
      prisma.petFriendProfile.aggregate.mockResolvedValue({
        _avg: { avgRating: 4.25 },
      });

      // Act
      const result = await service.getLiveMetrics();

      // Assert
      expect(result).toHaveProperty('bookingsToday', 12);
      expect(result).toHaveProperty('activeStays', 5);
      expect(result).toHaveProperty('pendingApprovalsCount', 0);
      expect(result).toHaveProperty('revenueToday', 15000);
      expect(result).toHaveProperty('activeProviders', 30);
      expect(result).toHaveProperty('suspendedProviders', 3);
      expect(result).toHaveProperty('lowRatingProviders', 2);
      expect(result).toHaveProperty('avgPlatformRating', 4.25);
      expect(result).toHaveProperty('gmvThisMonth', 120000);
      expect(result).toHaveProperty('commissionThisMonth');
      expect(result.commissionThisMonth).toBe(18000);
      expect(result.recentAuditEntries).toHaveLength(20);
      expect(result.recentAuditEntries[0]).toHaveProperty('id');
      expect(result.recentAuditEntries[0]).toHaveProperty('agentName');
      expect(result.recentAuditEntries[0]).toHaveProperty('action');
      expect(result.recentAuditEntries[0]).toHaveProperty('outcome');
      expect(result.recentAuditEntries[0]).toHaveProperty('createdAt');
    });

    it('should handle DB errors gracefully and return zeros', async () => {
      // Arrange — all DB calls reject
      prisma.booking.count.mockRejectedValue(new Error('DB connection lost'));
      prisma.booking.aggregate.mockRejectedValue(new Error('DB connection lost'));
      prisma.petFriendProfile.count.mockRejectedValue(new Error('DB connection lost'));
      prisma.petFriendProfile.aggregate.mockRejectedValue(new Error('DB connection lost'));

      // Act
      const result = await service.getLiveMetrics();

      // Assert — all numeric fields should be 0
      expect(result.bookingsToday).toBe(0);
      expect(result.activeStays).toBe(0);
      expect(result.revenueToday).toBe(0);
      expect(result.activeProviders).toBe(0);
      expect(result.suspendedProviders).toBe(0);
      expect(result.lowRatingProviders).toBe(0);
      expect(result.avgPlatformRating).toBe(0);
      expect(result.gmvThisMonth).toBe(0);
      expect(result.commissionThisMonth).toBe(0);
      expect(result.pendingApprovalsCount).toBe(0);
      expect(result.recentAuditEntries).toHaveLength(20);
    });
  });

  // ── getProviders ────────────────────────────────────────────────────────────

  describe('getProviders', () => {
    const mockProfiles = [
      {
        id: 'pf-1',
        addressCity: 'Cairo',
        status: 'APPROVED',
        avgRating: 4.8,
        totalBookings: 25,
        commissionRate: 0.10,
        createdAt: new Date(),
        user: { firstName: 'Ahmed', lastName: 'Hassan', email: 'ahmed@test.com' },
      },
      {
        id: 'pf-2',
        addressCity: 'Alexandria',
        status: 'PENDING_DOCS',
        avgRating: 0,
        totalBookings: 0,
        commissionRate: 0.15,
        createdAt: new Date(),
        user: { firstName: 'Sara', lastName: 'Ali', email: 'sara@test.com' },
      },
    ];

    it('should return paginated list with correct shape', async () => {
      // Arrange
      prisma.petFriendProfile.findMany.mockResolvedValue(mockProfiles);
      prisma.petFriendProfile.count.mockResolvedValue(2);

      // Act
      const result = await service.getProviders({});

      // Assert
      expect(result).toHaveProperty('providers');
      expect(result).toHaveProperty('total', 2);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result.providers).toHaveLength(2);
      expect(result.providers[0]).toEqual({
        id: 'pf-1',
        name: 'Ahmed Hassan',
        type: 'petfriend',
        city: 'Cairo',
        status: 'APPROVED',
        rating: 4.8,
        totalBookings: 25,
        commissionTier: '10%',
        lastBookingDate: null,
        email: 'ahmed@test.com',
      });
      expect(result.providers[1].commissionTier).toBe('15%');
    });

    it('should filter by status', async () => {
      // Arrange
      prisma.petFriendProfile.findMany.mockResolvedValue([mockProfiles[0]]);
      prisma.petFriendProfile.count.mockResolvedValue(1);

      // Act
      const result = await service.getProviders({ status: 'APPROVED' });

      // Assert
      expect(prisma.petFriendProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      expect(result.providers).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should search by name', async () => {
      // Arrange
      prisma.petFriendProfile.findMany.mockResolvedValue([mockProfiles[0]]);
      prisma.petFriendProfile.count.mockResolvedValue(1);

      // Act
      const result = await service.getProviders({ search: 'Ahmed' });

      // Assert
      const callArgs = prisma.petFriendProfile.findMany.mock.calls[0][0];
      expect(callArgs.where.user).toBeDefined();
      expect(callArgs.where.user.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ firstName: { contains: 'Ahmed', mode: 'insensitive' } }),
        ]),
      );
      expect(result.providers).toHaveLength(1);
    });
  });

  // ── getParents ──────────────────────────────────────────────────────────────

  describe('getParents', () => {
    const mockUsers = [
      {
        id: 'u-1',
        firstName: 'Mohamed',
        lastName: 'Saeed',
        email: 'mohamed@test.com',
        createdAt: new Date('2025-01-15'),
        lastLoginAt: new Date('2026-04-25'),
        isActive: true,
        isBanned: false,
        _count: { bookingsAsParent: 8 },
      },
      {
        id: 'u-2',
        firstName: 'Fatima',
        lastName: 'Nour',
        email: 'fatima@test.com',
        createdAt: new Date('2026-04-01'),
        lastLoginAt: null,
        isActive: true,
        isBanned: false,
        _count: { bookingsAsParent: 0 },
      },
    ];

    it('should return parent list with aggregates', async () => {
      // Arrange
      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count.mockResolvedValue(2);
      prisma.booking.groupBy.mockResolvedValue([
        { parentId: 'u-1', _sum: { totalPrice: 3200 } },
      ]);

      // Act
      const result = await service.getParents({});

      // Assert
      expect(result).toHaveProperty('parents');
      expect(result).toHaveProperty('total', 2);
      expect(result).toHaveProperty('page', 1);
      expect(result.parents).toHaveLength(2);
      expect(result.parents[0]).toEqual(
        expect.objectContaining({
          id: 'u-1',
          name: 'Mohamed Saeed',
          email: 'mohamed@test.com',
          totalBookings: 8,
          totalSpent: 3200,
          status: 'active',
        }),
      );
      expect(result.parents[1].totalSpent).toBe(0);
      expect(result.parents[1].lastActive).toBeNull();
    });

    it('should include segment counts', async () => {
      // Arrange
      prisma.user.findMany.mockResolvedValue(mockUsers);
      prisma.user.count
        .mockResolvedValueOnce(2) // total
        .mockResolvedValueOnce(1) // newUsers
        .mockResolvedValueOnce(5) // usersWithBookings (at-risk calc)
        .mockResolvedValueOnce(3); // usersWithRecentBookings (at-risk calc)
      prisma.booking.groupBy
        .mockResolvedValueOnce([{ parentId: 'u-1', _sum: { totalPrice: 3200 } }]) // spent
        .mockResolvedValueOnce([{ parentId: 'p1' }, { parentId: 'p2' }, { parentId: 'p3' }]); // power users

      // Act
      const result = await service.getParents({});

      // Assert
      expect(result).toHaveProperty('segments');
      expect(result.segments).toHaveProperty('powerUsers');
      expect(result.segments).toHaveProperty('atRisk');
      expect(result.segments).toHaveProperty('newUsers');
      expect(typeof result.segments.powerUsers).toBe('number');
      expect(typeof result.segments.atRisk).toBe('number');
      expect(typeof result.segments.newUsers).toBe('number');
    });
  });

  // ── getFinancialBreakdown ───────────────────────────────────────────────────

  describe('getFinancialBreakdown', () => {
    it('should return revenue/payouts/refunds/commission shape', async () => {
      // Arrange
      prisma.booking.aggregate
        .mockResolvedValueOnce({
          _sum: { totalPrice: 250000, commissionAmount: 37500 },
        }) // revenue
        .mockResolvedValueOnce({
          _count: 3,
          _sum: { refundAmount: 4500 },
        }); // refunds
      prisma.booking.count.mockResolvedValue(200); // total bookings in period
      prisma.booking.groupBy.mockResolvedValue([
        { serviceType: 'pet_watching_hourly', _sum: { totalPrice: 120000 } },
        { serviceType: 'dog_walking', _sum: { totalPrice: 80000 } },
        { serviceType: 'overnight_stay', _sum: { totalPrice: 50000 } },
      ]);
      prisma.petFriendPayout.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 5000 } })  // upcoming
        .mockResolvedValueOnce({ _sum: { amount: 180000 } }) // completed
        .mockResolvedValueOnce({ _sum: { amount: 2000 } });  // failed
      prisma.petFriendProfile.count
        .mockResolvedValueOnce(80)  // tier15 providers
        .mockResolvedValueOnce(12)  // tier10 providers
        .mockResolvedValueOnce(5);  // upgradeEligible

      // Act
      const result = await service.getFinancialBreakdown({ period: 'month' });

      // Assert
      expect(result).toHaveProperty('revenue');
      expect(result.revenue).toEqual(
        expect.objectContaining({
          total: 250000,
          serviceCommissions: 37500,
          productCommissions: 0,
        }),
      );
      expect(result.revenue.byType).toHaveLength(3);

      expect(result).toHaveProperty('payouts');
      expect(result.payouts).toEqual({
        upcoming: 5000,
        completed: 180000,
        failed: 2000,
      });

      expect(result).toHaveProperty('refunds');
      expect(result.refunds).toHaveProperty('count', 3);
      expect(result.refunds).toHaveProperty('total', 4500);
      expect(result.refunds).toHaveProperty('rate');
      expect(result.refunds.rate).toBe(1.5); // 3/200 * 100

      expect(result).toHaveProperty('commission');
      expect(result.commission.tier15).toEqual({ providers: 80, gmv: 0 });
      expect(result.commission.tier10).toEqual({ providers: 12, gmv: 0 });
      expect(result.commission.upgradeEligible).toBe(5);

      expect(result).toHaveProperty('period', 'month');
    });
  });

  // ── briefAgent ──────────────────────────────────────────────────────────────

  describe('briefAgent', () => {
    it('should return response for valid agent', async () => {
      // Arrange
      const dto = {
        agentId: 'layla',
        task: 'Review the booking module for performance issues',
        context: 'Users reported slow booking creation during peak hours',
        priority: 'high',
      };

      // Act
      const result = await service.briefAgent(dto);

      // Assert
      expect(result).toHaveProperty('agentId', 'layla');
      expect(result).toHaveProperty('agentName', 'Layla (Full-Stack Engineer)');
      expect(result).toHaveProperty('response');
      expect(result.response).toHaveProperty('reasoning');
      expect(result.response).toHaveProperty('proposedAction');
      expect(result.response).toHaveProperty('params');
      expect(result.response.params).toHaveProperty('taskReceived', dto.task);
      expect(result.response.params).toHaveProperty('priority', 'high');
      expect(result).toHaveProperty('briefedAt');
      expect(typeof result.briefedAt).toBe('string');
    });

    it('should reject unknown agentId with NotFoundException', async () => {
      // Arrange
      const dto = {
        agentId: 'unknown_agent',
        task: 'Do something',
        context: 'Test context',
        priority: 'low',
      };

      // Act & Assert
      await expect(service.briefAgent(dto)).rejects.toThrow(NotFoundException);
      await expect(service.briefAgent(dto)).rejects.toThrow(/unknown_agent/i);
    });

    it('should emit admin.agent_briefed event', async () => {
      // Arrange
      const dto = {
        agentId: 'nadia',
        task: 'Check KPIs',
        context: 'Monthly review',
        priority: 'medium',
      };

      // Act
      await service.briefAgent(dto);

      // Assert
      expect(events.emit).toHaveBeenCalledWith(
        'admin.agent_briefed',
        expect.objectContaining({
          agentId: 'nadia',
          agentName: 'Nadia (COO)',
          task: 'Check KPIs',
          priority: 'medium',
          briefedAt: expect.any(String),
        }),
      );
    });
  });
});
