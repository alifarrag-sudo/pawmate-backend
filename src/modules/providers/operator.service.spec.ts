import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperatorService } from './operator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessService } from '../business/business.service';

/**
 * Unit tests for OperatorService — focus on
 *   1. Auth gating (resolveBusinessId throws when no membership)
 *   2. Stats aggregation shape (spec fields + legacy web fields, zeros for
 *      empty teams)
 *   3. Team / member / invite delegation to BusinessService
 *   4. Bookings filter (memberId resolves to userId; team-empty short-circuit)
 */
describe('OperatorService', () => {
  let service: OperatorService;
  let prisma: any;
  let business: { getTeamList: jest.Mock; createInvite: jest.Mock };

  beforeEach(async () => {
    prisma = {
      businessProfile: { findUnique: jest.fn() },
      teamMember: { findFirst: jest.fn(), findMany: jest.fn() },
      booking: { count: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
      petFriendProfile: { aggregate: jest.fn() },
    };
    business = {
      getTeamList: jest.fn(),
      createInvite: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: BusinessService, useValue: business },
      ],
    }).compile();

    service = module.get<OperatorService>(OperatorService);
  });

  // ── Auth gating ─────────────────────────────────────────────────────

  describe('resolveBusinessId (via getOperatorStats)', () => {
    it('throws ForbiddenException when caller has no business membership', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(null);
      prisma.teamMember.findFirst.mockResolvedValue(null);

      await expect(service.getOperatorStats('orphan-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resolves businessId when caller is the business owner', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue({ id: 'biz-1' });
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: null, providerPayout: null },
      });
      prisma.petFriendProfile.aggregate.mockResolvedValue({ _avg: { avgRating: null } });

      const stats = await service.getOperatorStats('owner-1');

      expect(prisma.businessProfile.findUnique).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
        select: { id: true },
      });
      expect(stats.teamSize).toBe(0);
    });

    it('falls back to team membership when caller is not an owner', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(null);
      prisma.teamMember.findFirst.mockResolvedValue({ businessId: 'biz-2' });
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: null, providerPayout: null },
      });
      prisma.petFriendProfile.aggregate.mockResolvedValue({ _avg: { avgRating: null } });

      const stats = await service.getOperatorStats('member-1');
      expect(stats.teamSize).toBe(0); // empty team but no throw — auth resolved
    });
  });

  // ── Stats shape ─────────────────────────────────────────────────────

  describe('getOperatorStats', () => {
    beforeEach(() => {
      prisma.businessProfile.findUnique.mockResolvedValue({ id: 'biz-1' });
    });

    it('returns the spec fields + legacy web fields with zeros for empty teams', async () => {
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.aggregate.mockResolvedValue({
        _sum: { totalPrice: null, providerPayout: null },
      });
      prisma.petFriendProfile.aggregate.mockResolvedValue({ _avg: { avgRating: null } });

      const stats = await service.getOperatorStats('owner-1');

      // Spec contract
      expect(stats.totalBookings).toBe(0);
      expect(stats.activeBookings).toBe(0);
      expect(stats.completedBookings).toBe(0);
      expect(stats.totalEarningsEgp).toBe(0);
      expect(stats.pendingPayoutEgp).toBe(0);
      expect(stats.teamSize).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.thisMonthBookings).toBe(0);
      expect(stats.thisMonthEarningsEgp).toBe(0);

      // Legacy web fields
      expect(stats.bookingsThisWeek).toBe(0);
      expect(stats.revenueThisMonth).toBe(0);
      expect(stats.activeTeamMembers).toBe(0);
      expect(stats.pendingActions).toBe(0);
    });

    it('aggregates bookings + earnings + rating across an active team', async () => {
      prisma.teamMember.findMany.mockResolvedValue([
        { userId: 'pf-1' },
        { userId: 'pf-2' },
      ]);
      prisma.booking.count
        .mockResolvedValueOnce(40)   // total
        .mockResolvedValueOnce(5)    // active
        .mockResolvedValueOnce(30)   // completed
        .mockResolvedValueOnce(12)   // thisMonth
        .mockResolvedValueOnce(7)    // thisWeek
        .mockResolvedValueOnce(3);   // pending (legacy web "pendingActions")
      prisma.booking.aggregate
        // monthAggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 5000, providerPayout: 4250 } })
        // lifetimeAggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 18000, providerPayout: 15300 } });
      prisma.petFriendProfile.aggregate.mockResolvedValue({ _avg: { avgRating: 4.7 } });

      const stats = await service.getOperatorStats('owner-1');

      expect(stats.totalBookings).toBe(40);
      expect(stats.activeBookings).toBe(5);
      expect(stats.completedBookings).toBe(30);
      expect(stats.thisMonthBookings).toBe(12);
      expect(stats.bookingsThisWeek).toBe(7);
      expect(stats.totalEarningsEgp).toBe(15300);
      expect(stats.thisMonthEarningsEgp).toBe(4250);
      expect(stats.revenueThisMonth).toBe(5000);
      expect(stats.teamSize).toBe(2);
      expect(stats.averageRating).toBe(4.7);
      expect(stats.pendingActions).toBe(3);
    });
  });

  // ── Team delegation ─────────────────────────────────────────────────

  describe('listTeam / getTeamMember / invite', () => {
    beforeEach(() => {
      prisma.businessProfile.findUnique.mockResolvedValue({ id: 'biz-1' });
    });

    it('listTeam delegates to BusinessService.getTeamList with the resolved businessId', async () => {
      business.getTeamList.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.listTeam('owner-1', { status: 'ACTIVE' });

      expect(business.getTeamList).toHaveBeenCalledWith('owner-1', 'biz-1', {
        status: 'ACTIVE',
        providerType: undefined,
      });
      expect(result).toEqual([{ id: 'm1' }]);
    });

    it('getTeamMember returns member + recent bookings when found', async () => {
      prisma.teamMember.findFirst = jest.fn().mockResolvedValue({
        id: 'm1',
        businessId: 'biz-1',
        userId: 'pf-1',
      });
      prisma.booking.findMany.mockResolvedValue([{ id: 'b1' }]);

      const result = await service.getTeamMember('owner-1', 'm1');

      expect(prisma.teamMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1', businessId: 'biz-1' },
        }),
      );
      expect(result.bookings).toEqual([{ id: 'b1' }]);
    });

    it('getTeamMember throws NotFound when member is in a different business', async () => {
      prisma.teamMember.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getTeamMember('owner-1', 'foreign')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('invite delegates to BusinessService.createInvite', async () => {
      business.createInvite.mockResolvedValue({ id: 'inv-1' });

      const result = await service.invite('owner-1', {
        email: 'new@example.com',
      } as any);

      expect(business.createInvite).toHaveBeenCalledWith('owner-1', 'biz-1', {
        email: 'new@example.com',
      });
      expect(result).toEqual({ id: 'inv-1' });
    });
  });

  // ── Bookings filter ─────────────────────────────────────────────────

  describe('listBookings', () => {
    beforeEach(() => {
      prisma.businessProfile.findUnique.mockResolvedValue({ id: 'biz-1' });
    });

    it('short-circuits when team is empty', async () => {
      prisma.teamMember.findMany.mockResolvedValue([]);

      const result = await service.listBookings('owner-1', {});

      expect(result).toEqual({ bookings: [], total: 0, page: 1, pages: 0 });
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });

    it('memberId filter resolves to that member\'s userId', async () => {
      prisma.teamMember.findMany.mockResolvedValue([
        { id: 'm1', userId: 'pf-1' },
        { id: 'm2', userId: 'pf-2' },
      ]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.listBookings('owner-1', { memberId: 'm2' });

      const findManyCall = prisma.booking.findMany.mock.calls[0][0];
      expect(findManyCall.where.petFriendId).toBe('pf-2');
    });

    it('memberId that does not belong to the business yields no results', async () => {
      prisma.teamMember.findMany.mockResolvedValue([
        { id: 'm1', userId: 'pf-1' },
      ]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.listBookings('owner-1', { memberId: 'foreign' });

      const findManyCall = prisma.booking.findMany.mock.calls[0][0];
      expect(findManyCall.where.petFriendId).toBe('__never__');
    });

    it('clamps limit to 100 max', async () => {
      prisma.teamMember.findMany.mockResolvedValue([{ id: 'm1', userId: 'pf-1' }]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.listBookings('owner-1', { limit: 9999 });

      const findManyCall = prisma.booking.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(100);
    });
  });
});
