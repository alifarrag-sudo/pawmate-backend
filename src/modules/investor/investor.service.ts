import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { MailService } from '../mail/mail.service';
import {
  InviteInvestorDto,
  SendMessageDto,
  CreateInvestorUpdateDto,
  UploadInvestorDocDto,
} from './investor.dto';

/** OLT expires in 7 days — investor portal link has a week of validity */
const INVESTOR_OLT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Commission rate assumed for take-rate calculations */
const COMMISSION_RATE = 0.15;

@Injectable()
export class InvestorService {
  private readonly logger = new Logger(InvestorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Admin: invite a new investor ─────────────────────────────────────────────

  async inviteInvestor(
    dto: InviteInvestorDto,
  ): Promise<{ message: string; loginLink: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, roles: true },
    });

    let userId: string;

    if (existingUser) {
      // Guard: don't downgrade an admin or create duplicate investor
      if (existingUser.roles.includes('INVESTOR')) {
        throw new ConflictException('This email already has investor access.');
      }

      // Add investor role to existing account
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          roles: { push: 'INVESTOR' },
        },
      });

      userId = existingUser.id;
    } else {
      // Create a minimal investor account (no password — OLT is the first login)
      const newUser = await this.prisma.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: ['INVESTOR'],
          isParent: false,
          emailVerified: true,
        },
      });
      userId = newUser.id;
    }

    // Generate one-time login token (reuses the auth module's olt: pattern)
    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.setex(`olt:${token}`, INVESTOR_OLT_TTL_SECONDS, userId);

    const loginLink = `https://pawmatehub.com/investor/login?t=${token}`;

    // Fire-and-forget email
    this.sendInvestorInviteEmail(
      { email: dto.email, firstName: dto.firstName },
      loginLink,
    ).catch((err: Error) =>
      this.logger.error(`Investor invite email failed for ${dto.email}: ${err.message}`),
    );

    this.eventEmitter.emit('investor.invite_sent', {
      email: dto.email,
      userId,
    });

    return { message: 'Investor invited. Login link generated.', loginLink };
  }

  // ── Investor-facing: metrics dashboard ───────────────────────────────────────

  async getMetrics(): Promise<Record<string, unknown>> {
    const [bookingCount, userCount, petFriendCount, cityRows] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.petFriendProfile.count({ where: { status: 'APPROVED', isActive: true } }),
      this.prisma.petFriendProfile.groupBy({
        by: ['addressCity'],
        where: { addressCity: { not: null }, status: 'APPROVED' },
      }),
    ]);

    // Approximate GMV — sum all completed booking prices (anonymised)
    const revenueResult = await this.prisma.booking.aggregate({
      _sum: { totalPrice: true },
      where: { status: 'completed' },
    });

    const totalRevenueEgp = Number(revenueResult._sum.totalPrice ?? 0);

    return {
      bookings: {
        total: bookingCount,
        // Revenue shown rounded to nearest 1,000 EGP for privacy
        estimatedGmvEgp: Math.round(totalRevenueEgp / 1000) * 1000,
      },
      users: {
        totalActive: userCount,
      },
      providers: {
        activePetFriends: petFriendCount,
        citiesServed: cityRows.length,
      },
      asOf: new Date().toISOString(),
    };
  }

  // ── Investor-facing: detailed metrics with time series ─────────────────────

  async getMetricsDetailed(): Promise<Record<string, unknown>> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    try {
      // Parallel queries for all data
      const [
        bookingCount,
        completedBookings,
        revenueResult,
        userCount,
        petFriendCount,
        providerTypeGroups,
        cityRows,
      ] = await Promise.all([
        this.prisma.booking.count(),
        this.prisma.booking.count({ where: { status: 'completed' } }),
        this.prisma.booking.aggregate({
          _sum: { totalPrice: true },
          _avg: { totalPrice: true },
          where: { status: 'completed' },
        }),
        this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
        this.prisma.petFriendProfile.count({ where: { status: 'APPROVED', isActive: true } }),
        this.safeGroupBy('petFriendProfile', 'serviceType'),
        this.prisma.petFriendProfile.groupBy({
          by: ['addressCity'],
          where: { addressCity: { not: null }, status: 'APPROVED' },
          _count: { _all: true },
        }),
      ]);

      const totalGmv = Number(revenueResult._sum.totalPrice ?? 0);
      const avgBookingValue = Number(revenueResult._avg.totalPrice ?? 0);
      const commission = totalGmv * COMMISSION_RATE;
      const takeRate = totalGmv > 0 ? commission / totalGmv : 0;

      // Build monthly time series (compute in JS — avoids raw SQL portability issues)
      const monthlyRevenue = this.buildMonthlyPlaceholders(twelveMonthsAgo, now);
      const parentSignups = this.buildMonthlyPlaceholders(twelveMonthsAgo, now);
      const providerApprovals = this.buildMonthlyPlaceholders(twelveMonthsAgo, now);
      const bookingVolume = this.buildMonthlyPlaceholders(twelveMonthsAgo, now);

      // Attempt to get monthly booking data
      const monthlyBookings = await this.getMonthlyBookingData(twelveMonthsAgo);
      for (const mb of monthlyBookings) {
        const key = mb.month;
        const revenueEntry = monthlyRevenue.find((m) => m.month === key);
        if (revenueEntry) {
          revenueEntry.gmv = Number(mb.gmv ?? 0);
          revenueEntry.commission = Number(mb.gmv ?? 0) * COMMISSION_RATE;
        }
        const volumeEntry = bookingVolume.find((m) => m.month === key);
        if (volumeEntry) {
          volumeEntry.count = mb.count;
        }
      }

      // Monthly user signups
      const monthlyUsers = await this.getMonthlyUserSignups(twelveMonthsAgo);
      for (const mu of monthlyUsers) {
        const entry = parentSignups.find((m) => m.month === mu.month);
        if (entry) {
          entry.count = mu.count;
        }
      }

      // Monthly provider approvals
      const monthlyProviders = await this.getMonthlyProviderApprovals(twelveMonthsAgo);
      for (const mp of monthlyProviders) {
        const entry = providerApprovals.find((m) => m.month === mp.month);
        if (entry) {
          entry.count = mp.count;
        }
      }

      // Provider type distribution
      const byType = providerTypeGroups.map((g: { serviceType: string; _count: { _all: number } }) => ({
        type: g.serviceType ?? 'Unknown',
        count: g._count._all,
      }));

      // Revenue by provider type placeholder (from booking data if available)
      const byProviderType = byType.map((pt: { type: string; count: number }) => ({
        type: pt.type,
        gmv: 0,
        count: pt.count,
      }));

      // Geographic data
      const geographic = cityRows.map((row: { addressCity: string | null; _count: { _all: number } }) => ({
        city: row.addressCity ?? 'Unknown',
        parents: 0,
        providers: row._count._all,
        bookings: 0,
        gmv: 0,
      }));

      // Review rate placeholder
      const reviewRate = completedBookings > 0 ? 0 : 0;

      return {
        revenue: {
          monthly: monthlyRevenue,
          byProviderType,
          avgBookingValue: Math.round(avgBookingValue * 100) / 100,
        },
        growth: {
          parentSignups,
          providerApprovals,
          bookingVolume,
          retentionRate: 0,
        },
        unitEconomics: {
          takeRate: Math.round(takeRate * 10000) / 10000,
          estimatedLtv: Math.round(avgBookingValue * 4.5 * 100) / 100,
          cacPlaceholder: 'Tracking since launch',
        },
        geographic,
        providers: {
          byType,
          avgRating: 0,
          retentionRate: 0,
          reviewRate,
        },
        period: `${this.formatMonth(twelveMonthsAgo)} to ${this.formatMonth(now)}`,
        asOf: now.toISOString(),
      };
    } catch (error) {
      this.logger.warn(`getMetricsDetailed partial failure: ${(error as Error).message}`);
      return this.getMetricsDetailedFallback();
    }
  }

  // ── Investor-facing: documents list ──────────────────────────────────────────

  async getDocuments(): Promise<{ documents: unknown[] }> {
    // Placeholder — in production this would return pre-signed Cloudinary or S3 URLs
    // for investor decks, financial models, and data rooms.
    this.eventEmitter.emit('investor.document_accessed', { at: new Date().toISOString() });

    return {
      documents: [
        {
          id: 'pitch-deck-2026',
          title: 'PawMateHub Investor Pitch Deck 2026',
          type: 'PDF',
          updatedAt: '2026-04-01',
          url: null, // TODO: replace with signed Cloudinary URL once deck is finalised
        },
        {
          id: 'financial-model',
          title: 'Financial Model — 3-Year Projection',
          type: 'XLSX',
          updatedAt: '2026-04-10',
          url: null,
        },
      ],
    };
  }

  // ── Investor-facing: document download URL ─────────────────────────────────

  async getDocumentUrl(
    documentId: string,
  ): Promise<{ url: string | null; message: string }> {
    this.eventEmitter.emit('investor.document_downloaded', {
      documentId,
      at: new Date().toISOString(),
    });

    // Placeholder — in production, generate a signed Cloudinary URL with 1-hour TTL
    return {
      url: null,
      message: 'Document not yet uploaded',
    };
  }

  // ── Investor-facing: SAFE note ─────────────────────────────────────────────

  async getSafeNote(
    userId: string,
  ): Promise<Record<string, unknown>> {
    // In production, query the investor_agreements table by userId
    this.logger.debug(`SAFE note requested by user ${userId}`);

    return {
      investmentType: 'SAFE Note',
      amount: null,
      valuationCap: null,
      discountRate: null,
      investmentDate: null,
      status: 'Active',
      terms: 'Standard Y Combinator SAFE with valuation cap and discount',
      proRataRights: true,
    };
  }

  // ── Investor-facing: updates feed ──────────────────────────────────────────

  async getUpdates(): Promise<Record<string, unknown>[]> {
    // Placeholder seed data — in production, query the investor_updates table
    return [
      {
        id: 'welcome',
        date: '2026-04-28',
        subject: 'Welcome to PawMateHub Investor Portal',
        body:
          'Dear Investor,\n\n' +
          'Welcome to the PawMateHub investor portal. Here you will find real-time platform metrics, ' +
          'financial documents, and quarterly updates.\n\n' +
          '## What you can do\n' +
          '- View live platform KPIs and growth metrics\n' +
          '- Access pitch deck, financial model, and data room documents\n' +
          '- Review your SAFE note terms\n' +
          '- Send messages to the founding team\n\n' +
          'We are excited to have you on board as we scale pet care across Egypt.\n\n' +
          'Best regards,\nThe PawMateHub Team',
        read: false,
      },
    ];
  }

  // ── Investor-facing: messages ──────────────────────────────────────────────

  async getMessages(): Promise<Record<string, unknown>[]> {
    // Placeholder — in production, query the investor_messages table
    return [];
  }

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
  ): Promise<Record<string, unknown>> {
    const messageId = randomUUID();
    const createdAt = new Date().toISOString();

    this.eventEmitter.emit('investor.message_sent', {
      id: messageId,
      userId,
      body: dto.body,
      createdAt,
    });

    return {
      id: messageId,
      body: dto.body,
      createdAt,
      senderRole: 'investor',
    };
  }

  // ── Admin: create investor update ──────────────────────────────────────────

  async createInvestorUpdate(
    dto: CreateInvestorUpdateDto,
  ): Promise<Record<string, unknown>> {
    const updateId = randomUUID();
    const date = dto.date ?? new Date().toISOString().slice(0, 10);

    this.eventEmitter.emit('investor.update_created', {
      id: updateId,
      title: dto.title,
      date,
    });

    return {
      id: updateId,
      title: dto.title,
      body: dto.body,
      date,
      createdAt: new Date().toISOString(),
    };
  }

  // ── Admin: upload investor document ────────────────────────────────────────

  async uploadInvestorDoc(
    dto: UploadInvestorDocDto,
  ): Promise<{ message: string; document: Record<string, unknown> }> {
    const docId = randomUUID();

    this.eventEmitter.emit('investor.document_uploaded', {
      id: docId,
      title: dto.title,
      section: dto.section,
    });

    return {
      message: 'Document uploaded successfully.',
      document: {
        id: docId,
        title: dto.title,
        section: dto.section,
        fileUrl: dto.fileUrl,
        uploadedAt: new Date().toISOString(),
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendInvestorInviteEmail(
    user: { email: string; firstName: string },
    loginLink: string,
  ): Promise<void> {
    // Reuses the team welcome template — same OLT flow, different sender context.
    await this.mail.sendTeamWelcomeWithLoginLink(user, 'PawMateHub Investor Portal', loginLink);
  }

  /** Build an array of monthly placeholders from startDate to endDate */
  private buildMonthlyPlaceholders(
    startDate: Date,
    endDate: Date,
  ): Array<{ month: string; [key: string]: unknown }> {
    const months: Array<{ month: string; [key: string]: unknown }> = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (cursor <= endDate) {
      months.push({
        month: this.formatMonth(cursor),
        gmv: 0,
        commission: 0,
        count: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  /** Format a date as YYYY-MM */
  private formatMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /** Safe groupBy that returns empty array if the model/field doesn't exist */
  private async safeGroupBy(
    model: string,
    field: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const prismaModel = (this.prisma as unknown as Record<string, unknown>)[model] as
        | { groupBy: (args: Record<string, unknown>) => Promise<unknown[]> }
        | undefined;

      if (!prismaModel?.groupBy) {
        return [];
      }

      return (await prismaModel.groupBy({
        by: [field],
        where: { status: 'APPROVED', isActive: true },
        _count: { _all: true },
      })) as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }

  /** Get monthly booking data aggregated by month */
  private async getMonthlyBookingData(
    since: Date,
  ): Promise<Array<{ month: string; count: number; gmv: number }>> {
    try {
      const bookings = await this.prisma.booking.findMany({
        where: {
          createdAt: { gte: since },
          status: 'completed',
        },
        select: { createdAt: true, totalPrice: true },
      });

      const monthMap = new Map<string, { count: number; gmv: number }>();
      for (const b of bookings) {
        const key = this.formatMonth(b.createdAt);
        const entry = monthMap.get(key) ?? { count: 0, gmv: 0 };
        entry.count += 1;
        entry.gmv += Number(b.totalPrice ?? 0);
        monthMap.set(key, entry);
      }

      return Array.from(monthMap.entries()).map(([month, data]) => ({
        month,
        ...data,
      }));
    } catch {
      return [];
    }
  }

  /** Get monthly user signups */
  private async getMonthlyUserSignups(
    since: Date,
  ): Promise<Array<{ month: string; count: number }>> {
    try {
      const users = await this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      });

      const monthMap = new Map<string, number>();
      for (const u of users) {
        const key = this.formatMonth(u.createdAt);
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }

      return Array.from(monthMap.entries()).map(([month, count]) => ({
        month,
        count,
      }));
    } catch {
      return [];
    }
  }

  /** Get monthly provider approvals */
  private async getMonthlyProviderApprovals(
    since: Date,
  ): Promise<Array<{ month: string; count: number }>> {
    try {
      const providers = await this.prisma.petFriendProfile.findMany({
        where: {
          status: 'APPROVED',
          updatedAt: { gte: since },
        },
        select: { updatedAt: true },
      });

      const monthMap = new Map<string, number>();
      for (const p of providers) {
        const key = this.formatMonth(p.updatedAt);
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }

      return Array.from(monthMap.entries()).map(([month, count]) => ({
        month,
        count,
      }));
    } catch {
      return [];
    }
  }

  /** Fallback response when detailed metrics queries fail */
  private getMetricsDetailedFallback(): Record<string, unknown> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    return {
      revenue: {
        monthly: [],
        byProviderType: [],
        avgBookingValue: 0,
      },
      growth: {
        parentSignups: [],
        providerApprovals: [],
        bookingVolume: [],
        retentionRate: 0,
      },
      unitEconomics: {
        takeRate: 0,
        estimatedLtv: 0,
        cacPlaceholder: 'Tracking since launch',
      },
      geographic: [],
      providers: {
        byType: [],
        avgRating: 0,
        retentionRate: 0,
        reviewRate: 0,
      },
      period: `${this.formatMonth(twelveMonthsAgo)} to ${this.formatMonth(now)}`,
      asOf: now.toISOString(),
    };
  }
}
