import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import {
  GetProvidersQueryDto,
  GetParentsQueryDto,
  GetFinancialBreakdownQueryDto,
  BriefAgentDto,
  KNOWN_AGENTS,
  AGENT_NAMES,
  KnownAgentId,
} from './admin.dto';

// Cairo timezone offset: UTC+2 (7200000 ms)
const CAIRO_OFFSET_MS = 2 * 60 * 60 * 1000;

function startOfTodayCairo(): Date {
  const now = new Date();
  const cairoNow = new Date(now.getTime() + CAIRO_OFFSET_MS);
  const startCairo = new Date(
    cairoNow.getFullYear(),
    cairoNow.getMonth(),
    cairoNow.getDate(),
  );
  return new Date(startCairo.getTime() - CAIRO_OFFSET_MS);
}

function startOfPeriod(period: string): Date {
  const now = new Date();
  const cairoNow = new Date(now.getTime() + CAIRO_OFFSET_MS);

  if (period === 'year') {
    const start = new Date(cairoNow.getFullYear(), 0, 1);
    return new Date(start.getTime() - CAIRO_OFFSET_MS);
  }
  if (period === 'quarter') {
    const quarter = Math.floor(cairoNow.getMonth() / 3);
    const start = new Date(cairoNow.getFullYear(), quarter * 3, 1);
    return new Date(start.getTime() - CAIRO_OFFSET_MS);
  }
  // default: month
  const start = new Date(cairoNow.getFullYear(), cairoNow.getMonth(), 1);
  return new Date(start.getTime() - CAIRO_OFFSET_MS);
}

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── Existing endpoints ────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [totalUsers, totalBookings, activeBookings] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { status: 'active' } }),
    ]);
    return { totalUsers, totalBookings, activeBookings };
  }

  async banUser(userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, banReason: reason },
    });

    await this.redis.del(`user:active:${userId}`);

    this.eventEmitter.emit('account.suspended', { userId, reason });
    return { message: 'User banned successfully.' };
  }

  async unbanUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, banReason: null },
    });

    await this.redis.del(`user:active:${userId}`);

    this.eventEmitter.emit('account.unsuspended', { userId });
    return { message: 'User unbanned successfully.' };
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.redis.del(`user:active:${userId}`);

    return { message: 'User soft-deleted successfully.' };
  }

  // ── 1. GET /admin/metrics/live ────────────────────────────────────────────────

  async getLiveMetrics() {
    const now = new Date();
    const todayStart = startOfTodayCairo();
    const monthStart = startOfPeriod('month');

    const safeCount = async (
      model: 'booking' | 'user' | 'petFriendProfile',
      where: Record<string, unknown>,
    ): Promise<number> => {
      try {
        return await (this.prisma[model] as any).count({ where });
      } catch {
        return 0;
      }
    };

    const safeAggregate = async (
      model: 'booking',
      args: Record<string, unknown>,
    ): Promise<any> => {
      try {
        return await (this.prisma[model] as any).aggregate(args);
      } catch {
        return { _sum: { totalPrice: null }, _avg: { totalPrice: null } };
      }
    };

    const [
      bookingsToday,
      activeStays,
      revenueTodayAgg,
      activeProviders,
      suspendedProviders,
      avgRatingAgg,
      gmvAgg,
    ] = await Promise.all([
      safeCount('booking', {
        createdAt: { gte: todayStart, lte: now },
      }),
      safeCount('booking', {
        status: { in: ['active', 'in_progress'] },
      }),
      safeAggregate('booking', {
        _sum: { totalPrice: true },
        where: {
          status: 'completed',
          updatedAt: { gte: todayStart, lte: now },
        },
      }),
      safeCount('petFriendProfile', {
        status: 'APPROVED',
        isActive: true,
      }),
      safeCount('petFriendProfile', {
        status: 'SUSPENDED',
      }),
      safeAggregate('booking', {
        _avg: { totalPrice: true },
        where: { status: 'completed' },
      }),
      safeAggregate('booking', {
        _sum: { totalPrice: true },
        where: {
          status: 'completed',
          updatedAt: { gte: monthStart, lte: now },
        },
      }),
    ]);

    let lowRatingProviders = 0;
    let avgPlatformRating = 0;
    try {
      const lowRatingResult = await this.prisma.petFriendProfile.count({
        where: {
          avgRating: { lt: 3.5 },
          totalReviews: { gt: 0 },
        },
      });
      lowRatingProviders = lowRatingResult;
    } catch {
      lowRatingProviders = 0;
    }

    try {
      const ratingAgg = await this.prisma.petFriendProfile.aggregate({
        _avg: { avgRating: true },
        where: { totalReviews: { gt: 0 } },
      });
      avgPlatformRating = Number(ratingAgg._avg?.avgRating) || 0;
    } catch {
      avgPlatformRating = 0;
    }

    const revenueToday = Number(revenueTodayAgg._sum?.totalPrice) || 0;
    const gmvThisMonth = Number(gmvAgg._sum?.totalPrice) || 0;
    const commissionThisMonth = Math.round(gmvThisMonth * 0.15 * 100) / 100;

    // Placeholder audit entries since agent_audit_log table may not exist
    const recentAuditEntries = Array.from({ length: 20 }, (_, i) => ({
      id: `audit-placeholder-${i + 1}`,
      agentName: KNOWN_AGENTS[i % KNOWN_AGENTS.length],
      action: 'system_check',
      outcome: 'success',
      createdAt: new Date(now.getTime() - i * 3600000).toISOString(),
    }));

    return {
      bookingsToday,
      activeStays,
      pendingApprovalsCount: 0,
      revenueToday,
      activeProviders,
      suspendedProviders,
      lowRatingProviders,
      avgPlatformRating: Math.round(avgPlatformRating * 100) / 100,
      gmvThisMonth,
      commissionThisMonth,
      recentAuditEntries,
    };
  }

  // ── 2. GET /admin/providers ───────────────────────────────────────────────────

  async getProviders(query: GetProvidersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.city) {
      where.addressCity = { contains: query.city, mode: 'insensitive' };
    }

    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    try {
      const [profiles, total] = await Promise.all([
        this.prisma.petFriendProfile.findMany({
          where,
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.petFriendProfile.count({ where }),
      ]);

      const providers = profiles.map((p: any) => ({
        id: p.id,
        name: `${p.user.firstName} ${p.user.lastName}`,
        type: 'petfriend',
        city: p.addressCity || '',
        status: p.status,
        rating: Number(p.avgRating) || 0,
        totalBookings: p.totalBookings || 0,
        commissionTier: p.commissionRate <= 0.10 ? '10%' : '15%',
        lastBookingDate: null,
        email: p.user.email,
      }));

      return { providers, total, page, limit };
    } catch {
      return { providers: [], total: 0, page, limit };
    }
  }

  // ── 3. GET /admin/parents ─────────────────────────────────────────────────────

  async getParents(query: GetParentsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = {
      isParent: true,
      deletedAt: null,
    };

    if (query.status === 'banned') {
      where.isBanned = true;
    } else if (query.status === 'inactive') {
      where.isActive = false;
    } else if (query.status === 'active') {
      where.isActive = true;
      where.isBanned = false;
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    try {
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            createdAt: true,
            lastLoginAt: true,
            isActive: true,
            isBanned: true,
            _count: {
              select: { bookingsAsParent: true },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      // Aggregate spent per parent
      const userIds = users.map((u: any) => u.id);
      let spentMap: Record<string, number> = {};
      if (userIds.length > 0) {
        try {
          const spentResult = await this.prisma.booking.groupBy({
            by: ['parentId'],
            where: {
              parentId: { in: userIds },
              status: 'completed',
            },
            _sum: { totalPrice: true },
          });
          spentMap = spentResult.reduce((acc: Record<string, number>, r: any) => {
            acc[r.parentId] = Number(r._sum?.totalPrice) || 0;
            return acc;
          }, {});
        } catch {
          // leave empty
        }
      }

      const parents = users.map((u: any) => {
        const userStatus = u.isBanned ? 'banned' : u.isActive ? 'active' : 'inactive';
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          city: '',
          registeredAt: u.createdAt.toISOString(),
          totalBookings: u._count.bookingsAsParent,
          totalSpent: spentMap[u.id] || 0,
          lastActive: u.lastLoginAt?.toISOString() || null,
          status: userStatus,
        };
      });

      // Segment counts
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      let powerUsers = 0;
      let atRisk = 0;
      let newUsers = 0;

      try {
        // Power users: 5+ bookings in last 90 days
        const powerResult = await this.prisma.booking.groupBy({
          by: ['parentId'],
          where: {
            createdAt: { gte: ninetyDaysAgo },
          },
          _count: { _all: true },
          having: {
            parentId: { _count: { gte: 5 } },
          },
        });
        powerUsers = powerResult.length;
      } catch {
        powerUsers = 0;
      }

      try {
        // New users: registered in last 30 days, 0 bookings
        const newUsersResult = await this.prisma.user.count({
          where: {
            isParent: true,
            deletedAt: null,
            createdAt: { gte: thirtyDaysAgo },
            bookingsAsParent: { none: {} },
          },
        });
        newUsers = newUsersResult;
      } catch {
        newUsers = 0;
      }

      try {
        // At-risk: has bookings but none in last 60 days
        const usersWithBookings = await this.prisma.user.count({
          where: {
            isParent: true,
            deletedAt: null,
            bookingsAsParent: { some: {} },
          },
        });
        const usersWithRecentBookings = await this.prisma.user.count({
          where: {
            isParent: true,
            deletedAt: null,
            bookingsAsParent: {
              some: {
                createdAt: { gte: sixtyDaysAgo },
              },
            },
          },
        });
        atRisk = Math.max(0, usersWithBookings - usersWithRecentBookings);
      } catch {
        atRisk = 0;
      }

      // Filter by segment if requested
      if (query.segment) {
        // Segment filtering is a best-effort annotation; the list is still paginated from all parents
        // A production implementation would push this into the DB query
      }

      return {
        parents,
        total,
        page,
        segments: {
          powerUsers,
          atRisk,
          newUsers,
        },
      };
    } catch {
      return {
        parents: [],
        total: 0,
        page,
        segments: { powerUsers: 0, atRisk: 0, newUsers: 0 },
      };
    }
  }

  // ── 4. GET /admin/financials/breakdown ─────────────────────────────────────────

  async getFinancialBreakdown(query: GetFinancialBreakdownQueryDto) {
    const period = query.period ?? 'month';
    const periodStart = startOfPeriod(period);
    const now = new Date();

    let revenueTotal = 0;
    let byType: Array<{ type: string; amount: number }> = [];
    let serviceCommissions = 0;
    let productCommissions = 0;

    // Revenue aggregate
    try {
      const revenueAgg = await this.prisma.booking.aggregate({
        _sum: { totalPrice: true, commissionAmount: true },
        where: {
          status: 'completed',
          updatedAt: { gte: periodStart, lte: now },
        },
      });
      revenueTotal = Number(revenueAgg._sum?.totalPrice) || 0;
      serviceCommissions = Number(revenueAgg._sum?.commissionAmount) || 0;
    } catch {
      // zeros
    }

    // Revenue by service type
    try {
      const groupedRevenue = await this.prisma.booking.groupBy({
        by: ['serviceType'],
        where: {
          status: 'completed',
          updatedAt: { gte: periodStart, lte: now },
        },
        _sum: { totalPrice: true },
      });
      byType = groupedRevenue.map((g: any) => ({
        type: g.serviceType,
        amount: Number(g._sum?.totalPrice) || 0,
      }));
    } catch {
      byType = [];
    }

    // Payouts
    let payoutsUpcoming = 0;
    let payoutsCompleted = 0;
    let payoutsFailed = 0;
    try {
      const [upcoming, completed, failed] = await Promise.all([
        this.prisma.petFriendPayout.aggregate({
          _sum: { amount: true },
          where: { status: 'pending', createdAt: { gte: periodStart } },
        }),
        this.prisma.petFriendPayout.aggregate({
          _sum: { amount: true },
          where: { status: 'completed', createdAt: { gte: periodStart } },
        }),
        this.prisma.petFriendPayout.aggregate({
          _sum: { amount: true },
          where: { status: 'failed', createdAt: { gte: periodStart } },
        }),
      ]);
      payoutsUpcoming = Number(upcoming._sum?.amount) || 0;
      payoutsCompleted = Number(completed._sum?.amount) || 0;
      payoutsFailed = Number(failed._sum?.amount) || 0;
    } catch {
      // zeros
    }

    // Refunds
    let refundCount = 0;
    let refundTotal = 0;
    let totalBookingsInPeriod = 0;
    try {
      const [refundAgg, bookingsInPeriod] = await Promise.all([
        this.prisma.booking.aggregate({
          _count: true,
          _sum: { refundAmount: true },
          where: {
            paymentRefundedAt: { gte: periodStart, lte: now },
          },
        }),
        this.prisma.booking.count({
          where: { createdAt: { gte: periodStart, lte: now } },
        }),
      ]);
      refundCount = refundAgg._count || 0;
      refundTotal = Number(refundAgg._sum?.refundAmount) || 0;
      totalBookingsInPeriod = bookingsInPeriod;
    } catch {
      // zeros
    }
    const refundRate = totalBookingsInPeriod > 0
      ? Math.round((refundCount / totalBookingsInPeriod) * 10000) / 100
      : 0;

    // Commission tiers
    let tier15Providers = 0;
    let tier15Gmv = 0;
    let tier10Providers = 0;
    let tier10Gmv = 0;
    let upgradeEligible = 0;
    try {
      tier15Providers = await this.prisma.petFriendProfile.count({
        where: { commissionRate: { gt: 0.10 } },
      });
      tier10Providers = await this.prisma.petFriendProfile.count({
        where: { commissionRate: { lte: 0.10 } },
      });
      upgradeEligible = await this.prisma.petFriendProfile.count({
        where: {
          avgRating: { gte: 4.5 },
          totalBookings: { gte: 20 },
          commissionRate: { gt: 0.10 },
        },
      });
    } catch {
      // zeros
    }

    return {
      revenue: {
        total: revenueTotal,
        byType,
        serviceCommissions,
        productCommissions,
      },
      payouts: {
        upcoming: payoutsUpcoming,
        completed: payoutsCompleted,
        failed: payoutsFailed,
      },
      refunds: {
        count: refundCount,
        total: refundTotal,
        rate: refundRate,
      },
      commission: {
        tier15: { providers: tier15Providers, gmv: tier15Gmv },
        tier10: { providers: tier10Providers, gmv: tier10Gmv },
        upgradeEligible,
      },
      period,
    };
  }

  // ── 5. POST /admin/agents/brief ───────────────────────────────────────────────

  async briefAgent(dto: BriefAgentDto) {
    const agentId = dto.agentId.toLowerCase() as KnownAgentId;

    if (!KNOWN_AGENTS.includes(agentId)) {
      throw new NotFoundException(
        `Unknown agent "${dto.agentId}". Valid agents: ${KNOWN_AGENTS.join(', ')}`,
      );
    }

    const agentName = AGENT_NAMES[agentId];

    // Simulated response — no real Anthropic API call
    const response = {
      reasoning: `Acknowledged task "${dto.task}" with priority ${dto.priority}. Context analyzed: "${dto.context.slice(0, 120)}..."`,
      proposedAction: `${agentName} will review and provide recommendations for: ${dto.task}`,
      params: {
        taskReceived: dto.task,
        priority: dto.priority,
        estimatedResponseTime: '5 minutes',
      },
    };

    const briefedAt = new Date().toISOString();

    this.eventEmitter.emit('admin.agent_briefed', {
      agentId,
      agentName,
      task: dto.task,
      priority: dto.priority,
      briefedAt,
    });

    return {
      agentId,
      agentName,
      response,
      briefedAt,
    };
  }
}
