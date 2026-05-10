import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MeetGreetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordMeetGreetConsentDto } from './meet-greet.dto';
import {
  CONSENT_TEXT_VERSION,
  CONSENT_TEXT_EN,
  CONSENT_TEXT_AR,
  isMeetGreetEligible,
} from './meet-greet.constants';

/**
 * G2 Meet & Greet consent service — observe-only mode.
 *
 * The MEET_GREET_BLOCKS_PAYMENT env flag controls whether a missing or
 * negative consent gates the payment step. At time of writing it's
 * `false`, so this service records but doesn't block.
 *
 * Each consent row pins the wording version, the EN/AR snapshot, and
 * the parent + provider ids. Re-consenting upserts onto the same
 * bookingId-keyed row.
 */
@Injectable()
export class MeetGreetService {
  private readonly logger = new Logger(MeetGreetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Whether the env flag is set to gate payment on consent. Read each
   * call so a config flip doesn't require restart for tests.
   */
  private get blocksPayment(): boolean {
    return process.env.MEET_GREET_BLOCKS_PAYMENT === 'true';
  }

  async recordConsent(
    parentId: string,
    bookingId: string,
    dto: RecordMeetGreetConsentDto,
  ): Promise<{ recorded: true; blocked: boolean; status: MeetGreetStatus }> {
    if (!dto.consentTextVersion || !dto.consentTextVersion.trim()) {
      throw new BadRequestException('consentTextVersion is required');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        parentId: true,
        petFriendId: true,
        serviceType: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.parentId !== parentId) {
      throw new ForbiddenException('Only the booking parent can record Meet & Greet consent');
    }

    if (!isMeetGreetEligible(booking.serviceType)) {
      throw new BadRequestException(
        `Meet & Greet only applies to BOARDING and DAY_CARE bookings (got ${booking.serviceType})`,
      );
    }

    const now = new Date();
    const consentGiven = !!dto.consentGiven;
    const status: MeetGreetStatus = consentGiven
      ? MeetGreetStatus.SCHEDULED
      : MeetGreetStatus.WAIVED;

    const consent = await this.prisma.meetGreetConsent.upsert({
      where: { bookingId },
      create: {
        bookingId,
        parentId,
        providerId: booking.petFriendId ?? parentId,
        status,
        parentConsentGiven: consentGiven,
        parentConsentAt: now,
        consentTextVersion: dto.consentTextVersion,
        consentTextEn: CONSENT_TEXT_EN,
        consentTextAr: CONSENT_TEXT_AR,
        waivedAt: consentGiven ? null : now,
        waivedReason: consentGiven ? null : dto.waivedReason ?? null,
      },
      update: {
        status,
        parentConsentGiven: consentGiven,
        parentConsentAt: now,
        consentTextVersion: dto.consentTextVersion,
        consentTextEn: CONSENT_TEXT_EN,
        consentTextAr: CONSENT_TEXT_AR,
        waivedAt: consentGiven ? null : now,
        waivedReason: consentGiven ? null : dto.waivedReason ?? null,
      },
    });

    this.events.emit('booking.meet_greet_consent_given', {
      bookingId,
      parentId,
      providerId: consent.providerId,
      consentGiven,
      consentTextVersion: dto.consentTextVersion,
      status,
    });

    this.logger.log(
      `Meet & Greet consent recorded for booking ${bookingId} ` +
        `(consentGiven=${consentGiven}, version=${dto.consentTextVersion}, ` +
        `blocksPayment=${this.blocksPayment})`,
    );

    // Observe-only mode: blocked=false even when consentGiven=false.
    // When MEET_GREET_BLOCKS_PAYMENT flips to 'true', return blocked=true
    // on missing consent so the client can short-circuit the payment step.
    const blocked = this.blocksPayment && !consentGiven;
    return { recorded: true, blocked, status };
  }

  async getConsent(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, parentId: true, petFriendId: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isParticipant =
      booking.parentId === userId || booking.petFriendId === userId;

    if (!isParticipant) {
      throw new ForbiddenException('Only booking participants can view Meet & Greet consent');
    }

    const consent = await this.prisma.meetGreetConsent.findUnique({
      where: { bookingId },
    });

    return consent ?? null;
  }
}
