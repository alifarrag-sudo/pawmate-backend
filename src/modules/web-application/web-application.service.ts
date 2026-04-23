import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SaveProgressDto, ResumeApplicationDto } from './web-application.dto';

@Injectable()
export class WebApplicationService {
  private readonly logger = new Logger(WebApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // -- POST /web/application/save-progress --------------------------------------

  async saveProgress(
    userId: string | null,
    dto: SaveProgressDto,
  ): Promise<{ message: string; draftId: string }> {
    const isFirstStep = dto.step === 1;

    // For authenticated users we key on userId; for guests on the email in the step data payload.
    const guestEmail =
      userId === null
        ? (dto.data['email'] as string | undefined) ?? null
        : null;

    // Cast to Prisma's InputJsonValue so TypeScript accepts Record<string, unknown>
    const jsonData = dto.data as unknown as Prisma.InputJsonValue;

    // Upsert: one draft per user (or per email for guests)
    let draft: { id: string };

    if (userId) {
      draft = await this.prisma.webApplicationDraft.upsert({
        where: { userId },
        create: { userId, email: null, step: dto.step, data: jsonData },
        update: { step: dto.step, data: jsonData, updatedAt: new Date() },
        select: { id: true },
      });
    } else {
      draft = await this.prisma.webApplicationDraft.upsert({
        where: { email: guestEmail ?? '' },
        create: { userId: null, email: guestEmail, step: dto.step, data: jsonData },
        update: { step: dto.step, data: jsonData, updatedAt: new Date() },
        select: { id: true },
      });
    }

    const eventName = isFirstStep
      ? 'web.application_started'
      : 'web.application_step_completed';

    this.eventEmitter.emit(eventName, {
      draftId: draft.id,
      userId,
      step: dto.step,
    });

    this.logger.log(`Web application draft ${draft.id} saved at step ${dto.step}`);

    return { message: 'Progress saved.', draftId: draft.id };
  }

  // -- GET /web/application/my-draft -------------------------------------------

  async getMyDraft(
    userId: string,
  ): Promise<{ step: number; data: Record<string, unknown> }> {
    const draft = await this.prisma.webApplicationDraft.findUnique({
      where: { userId },
      select: { step: true, data: true },
    });

    if (!draft) {
      throw new NotFoundException('No in-progress application draft found.');
    }

    return { step: draft.step, data: draft.data as Record<string, unknown> };
  }

  // -- POST /web/application/resume --------------------------------------------

  async resumeApplication(
    userId: string | null,
    dto: ResumeApplicationDto,
  ): Promise<{ step: number; data: Record<string, unknown> }> {
    let draft: { step: number; data: unknown } | null = null;

    if (userId) {
      draft = await this.prisma.webApplicationDraft.findUnique({
        where: { userId },
        select: { step: true, data: true },
      });
    } else if (dto.email) {
      draft = await this.prisma.webApplicationDraft.findUnique({
        where: { email: dto.email },
        select: { step: true, data: true },
      });
    }

    if (!draft) {
      throw new NotFoundException('No saved application found. Please start a new application.');
    }

    this.eventEmitter.emit('web.application_resumed', {
      userId,
      email: dto.email,
      step: draft.step,
    });

    return {
      step: draft.step,
      data: draft.data as Record<string, unknown>,
    };
  }
}
