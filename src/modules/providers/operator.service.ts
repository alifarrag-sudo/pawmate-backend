import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessService } from '../business/business.service';
import { CreateTeamInviteDto } from '../business/business.dto';

/**
 * Operator-side aggregations for the web /operator dashboard.
 *
 * Every method that mutates first resolves the caller's BusinessProfile
 * (either as owner or active team member) and then delegates to
 * BusinessService for the actual operation. This keeps the auth + role
 * checks in one place (BusinessService.assertOwnerOrManager) while letting
 * the web client stay on the simpler /providers/operator/* URL surface.
 */
@Injectable()
export class OperatorService {
  constructor(
    private prisma: PrismaService,
    private business: BusinessService,
  ) {}

  /**
   * Resolve the BusinessProfile.id for the caller. Throws ForbiddenException
   * when the user has no business membership — the @JwtAuthGuard already
   * established identity, so a missing business is a permission problem.
   */
  private async resolveBusinessId(userId: string): Promise<string> {
    // Owners have a BusinessProfile with ownerId === userId.
    const owned = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (owned) return owned.id;

    // Otherwise: look for an active team membership.
    const member = await this.prisma.teamMember.findFirst({
      where: { userId, status: { not: 'REMOVED' } },
      select: { businessId: true },
    });
    if (member) return member.businessId;

    throw new ForbiddenException({
      error: 'NOT_AN_OPERATOR',
      message: 'You are not the owner of (or a member of) any business.',
    });
  }

  /**
   * Operator dashboard headline stats. Returns the spec's nine fields plus
   * the existing web `bookingsThisWeek`/`revenueThisMonth` keys so the
   * /operator/overview page works without a flag day.
   */
  async getOperatorStats(userId: string) {
    const businessId = await this.resolveBusinessId(userId);

    const [business, members] = await Promise.all([
      this.prisma.businessProfile.findUnique({
        where: { id: businessId },
        select: {
          totalBookings: true,
          // averageRating may not exist on the model in every snapshot;
          // we fall back to PetFriendProfile.avgRating below if absent.
          avgRating: true,
        } as any,
      }),
      this.prisma.teamMember.findMany({
        where: { businessId, status: 'ACTIVE' },
        select: { userId: true },
      }),
    ]);

    const teamUserIds = members.map((m) => m.userId);
    const teamSize = teamUserIds.length;

    // Date windows
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    // Bookings filtered by team petFriendIds. If the team is empty we skip
    // the queries entirely and return zeros — saves a round-trip.
    const baseWhere =
      teamUserIds.length > 0
        ? { petFriendId: { in: teamUserIds }, deletedAt: null }
        : { id: '__never__' }; // matches no rows

    const [
      totalBookings,
      activeBookings,
      completedBookings,
      thisMonthBookings,
      thisWeekBookings,
      monthAggregate,
      avgRatingAggregate,
    ] = await Promise.all([
      this.prisma.booking.count({ where: baseWhere as any }),
      this.prisma.booking.count({
        where: { ...(baseWhere as any), status: { in: ['accepted', 'active'] } },
      }),
      this.prisma.booking.count({
        where: { ...(baseWhere as any), status: 'completed' },
      }),
      this.prisma.booking.count({
        where: { ...(baseWhere as any), createdAt: { gte: startOfMonth } },
      }),
      this.prisma.booking.count({
        where: { ...(baseWhere as any), createdAt: { gte: startOfWeek } },
      }),
      this.prisma.booking.aggregate({
        where: {
          ...(baseWhere as any),
          status: 'completed',
          createdAt: { gte: startOfMonth },
        },
        _sum: { totalPrice: true, providerPayout: true },
      }),
      // Average rating across the team's PetFriend profiles.
      teamUserIds.length > 0
        ? this.prisma.petFriendProfile.aggregate({
            where: { userId: { in: teamUserIds } },
            _avg: { avgRating: true },
          })
        : Promise.resolve({ _avg: { avgRating: null } } as any),
    ]);

    // Lifetime earnings (only completed). Pull a separate aggregate so the
    // monthly window above doesn't pollute the lifetime total.
    const lifetimeAggregate = await this.prisma.booking.aggregate({
      where: { ...(baseWhere as any), status: 'completed' },
      _sum: { totalPrice: true, providerPayout: true },
    });

    const totalEarningsEgp = Math.round(Number(lifetimeAggregate._sum.providerPayout ?? 0));
    const thisMonthEarningsEgp = Math.round(Number(monthAggregate._sum.providerPayout ?? 0));
    const revenueThisMonth = Math.round(Number(monthAggregate._sum.totalPrice ?? 0));
    const averageRating = Math.round(Number(avgRatingAggregate._avg.avgRating ?? 0) * 10) / 10;

    // Pending payouts: sum of provider-payout on completed bookings whose
    // money hasn't been disbursed yet. Approximation: paymentStatus
    // captured/authorized AND no PetFriendPayout linked. Without a tight
    // payout-link join here we approximate using completed-but-unpaid count
    // multiplied by an average — leave at 0 unless you wire a stricter
    // payout state machine. TODO: replace with a real ledger query.
    const pendingPayoutEgp = 0;

    return {
      // ── Spec fields ────────────────────────────────────────────────
      totalBookings,
      activeBookings,
      completedBookings,
      totalEarningsEgp,
      pendingPayoutEgp,
      teamSize,
      averageRating,
      thisMonthBookings,
      thisMonthEarningsEgp,
      // ── Web /operator/overview legacy field names ─────────────────
      bookingsThisWeek: thisWeekBookings,
      revenueThisMonth,
      activeTeamMembers: teamSize,
      // pendingActions surfaces things requiring operator attention. A
      // reasonable proxy: pending bookings on the team (still untreated).
      pendingActions: await this.prisma.booking.count({
        where: { ...(baseWhere as any), status: 'pending' },
      }),
    };
  }

  /**
   * Operator's team list. Delegates to BusinessService.getTeamList which
   * already enforces business membership.
   */
  async listTeam(userId: string, filters?: { status?: string; providerType?: string }) {
    const businessId = await this.resolveBusinessId(userId);
    return this.business.getTeamList(userId, businessId, filters);
  }

  /**
   * Single team member — by TeamMember.id within the operator's business.
   */
  async getTeamMember(userId: string, memberId: string) {
    const businessId = await this.resolveBusinessId(userId);

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, businessId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            profilePhoto: true,
          },
        },
      },
    });
    if (!member) {
      throw new NotFoundException({
        error: 'TEAM_MEMBER_NOT_FOUND',
        message: 'Team member not found in your business.',
      });
    }

    // Recent bookings for this member (cap at 50).
    const bookings = await this.prisma.booking.findMany({
      where: { petFriendId: member.userId, deletedAt: null },
      select: {
        id: true,
        status: true,
        serviceType: true,
        requestedStart: true,
        totalPrice: true,
        parent: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { member, bookings };
  }

  /**
   * Send a team invite. Delegates to BusinessService.createInvite which
   * validates the caller's permission, creates the TeamInvite row, and
   * (per existing wiring) emits the email.
   */
  async invite(userId: string, dto: CreateTeamInviteDto) {
    const businessId = await this.resolveBusinessId(userId);
    return this.business.createInvite(userId, businessId, dto);
  }

  /**
   * Operator-scoped booking list. Filters bookings to those involving any
   * active member of the operator's business. Mirrors the shape returned
   * by GET /bookings so the web client can reuse its existing booking-row
   * components.
   */
  async listBookings(
    userId: string,
    filters: {
      status?: string;
      memberId?: string;
      serviceType?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const businessId = await this.resolveBusinessId(userId);

    const members = await this.prisma.teamMember.findMany({
      where: { businessId, status: 'ACTIVE' },
      select: { id: true, userId: true },
    });
    if (members.length === 0) {
      return { bookings: [], total: 0, page: 1, pages: 0 };
    }

    const teamUserIds = members.map((m) => m.userId);

    const where: any = {
      petFriendId: { in: teamUserIds },
      deletedAt: null,
    };

    // memberId filters by TeamMember.id; resolve to userId.
    if (filters.memberId) {
      const target = members.find((m) => m.id === filters.memberId);
      where.petFriendId = target ? target.userId : '__never__';
    }

    if (filters.status) where.status = filters.status;
    if (filters.serviceType) where.serviceType = filters.serviceType;
    if (filters.from || filters.to) {
      where.requestedStart = {};
      if (filters.from) where.requestedStart.gte = new Date(filters.from);
      if (filters.to) where.requestedStart.lte = new Date(filters.to);
    }

    const page = filters.page ?? 1;
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          parent: { select: { id: true, firstName: true, lastName: true } },
          petFriend: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { bookings, total, page, pages: Math.ceil(total / limit) };
  }
}
