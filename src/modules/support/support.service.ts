import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateContactDto } from './support.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitContact(dto: CreateContactDto): Promise<{ message: string }> {
    // Store in DB for CRM / support queue
    await this.prisma.contactSubmission.create({
      data: {
        name: dto.name,
        email: dto.email,
        type: dto.type,
        message: dto.message,
      },
    });

    // Fire-and-forget email notification to support team
    this.sendSupportNotification(dto).catch((err: Error) =>
      this.logger.error(`Support notification email failed: ${err.message}`),
    );

    this.eventEmitter.emit('web.contact_submitted', {
      email: dto.email,
      type: dto.type,
      name: dto.name,
    });

    return { message: 'Your message has been received. We will be in touch shortly.' };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendSupportNotification(dto: CreateContactDto): Promise<void> {
    // Placeholder — in production, send to support@pawmatehub.com via MailService
    // Currently MailService only exposes transactional user-facing templates.
    // Logging here so the event is traceable without a real template yet.
    this.logger.log(
      `[SUPPORT] New contact from ${dto.email} (${dto.type}): ${dto.message.slice(0, 80)}...`,
    );
  }
}
