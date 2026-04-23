import * as crypto from 'crypto';
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
import { InviteInvestorDto } from './investor.dto';

/** OLT expires in 7 days — investor portal link has a week of validity */
const INVESTOR_OLT_TTL_SECONDS = 7 * 24 * 60 * 60;

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

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendInvestorInviteEmail(
    user: { email: string; firstName: string },
    loginLink: string,
  ): Promise<void> {
    // Reuses the team welcome template — same OLT flow, different sender context.
    await this.mail.sendTeamWelcomeWithLoginLink(user, 'PawMateHub Investor Portal', loginLink);
  }
}
