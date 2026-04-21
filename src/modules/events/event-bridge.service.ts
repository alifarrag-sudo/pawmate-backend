import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID, createHmac } from 'crypto';

/**
 * Event bridge — subscribes to ALL in-process events and forwards them
 * as signed webhooks to the Command Center.
 *
 * Uses @OnEvent('**') wildcard to catch every EventEmitter2 event.
 * Delivery is non-blocking and retries 3 times before dropping.
 */
@Injectable()
export class EventBridgeService {
  private readonly logger = new Logger(EventBridgeService.name);
  private readonly webhookUrl: string | null;
  private readonly webhookSecret: string | null;
  private readonly retryDelays = [1000, 5000, 30000]; // 1s, 5s, 30s

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.webhookUrl = this.config.get<string>('COMMAND_CENTER_WEBHOOK_URL') || null;
    this.webhookSecret = this.config.get<string>('COMMAND_CENTER_WEBHOOK_SECRET') || null;

    if (!this.webhookUrl || !this.webhookSecret) {
      this.logger.warn(
        'Event bridge disabled — COMMAND_CENTER_WEBHOOK_URL or COMMAND_CENTER_WEBHOOK_SECRET not set.',
      );
    } else {
      this.logger.log(`Event bridge active → ${this.webhookUrl}`);
    }
  }

  // -------------------------------------------------------------------------
  // Wildcard listener — catches every emitted event
  // -------------------------------------------------------------------------

  @OnEvent('**', { async: true })
  async onAnyEvent(...args: unknown[]) {
    if (!this.webhookUrl || !this.webhookSecret) return;

    // EventEmitter2 wildcard: event name is on `this` context via .event
    // With @nestjs/event-emitter the event name is passed as the last arg
    // when using wildcard. We extract it from the internal property.
    const eventName = (this as any).event as string | undefined;
    if (!eventName || typeof eventName !== 'string') return;

    // Skip internal/framework events
    if (eventName.startsWith('_') || eventName === '**') return;

    const payload = args[0] ?? {};
    const p = payload as Record<string, unknown>;
    const booking = p?.booking as Record<string, unknown> | undefined;
    const user = p?.user as Record<string, unknown> | undefined;
    const correlationId: string =
      (p?.correlation_id as string | undefined) ??
      (booking?.id as string | undefined) ??
      (user?.id as string | undefined) ??
      randomUUID();

    const envelope = {
      event_id: randomUUID(),
      event_name: eventName,
      project_id: 'pawmate',
      emitted_at: new Date().toISOString(),
      source: 'pawmate-backend',
      payload,
      correlation_id: correlationId,
    };

    // Fire-and-forget — never block the originating request
    this.deliverWithRetry(envelope).catch((err) => {
      this.logger.error(`Event bridge delivery failed permanently for ${eventName}: ${err.message}`);
    });
  }

  // -------------------------------------------------------------------------
  // Delivery with retry
  // -------------------------------------------------------------------------

  private async deliverWithRetry(envelope: Record<string, unknown>): Promise<void> {
    const eventId = envelope.event_id as string;
    const eventName = envelope.event_name as string;

    // Create delivery tracking row
    let deliveryId: string | undefined;
    try {
      const delivery = await this.prisma.eventBridgeDelivery.create({
        data: {
          eventId,
          eventName,
          attempts: 0,
          delivered: false,
        },
      });
      deliveryId = delivery.id;
    } catch (err: any) {
      // Duplicate eventId (idempotent) — skip
      if (err.code === 'P2002') return;
      this.logger.error(`Failed to create delivery record: ${err.message}`);
    }

    const body = JSON.stringify(envelope);
    const signature = this.sign(body);

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const response = await fetch(this.webhookUrl!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (response.ok) {
          // Mark delivered
          if (deliveryId) {
            await this.prisma.eventBridgeDelivery.update({
              where: { id: deliveryId },
              data: {
                delivered: true,
                attempts: attempt + 1,
                lastAttemptAt: new Date(),
              },
            });
          }
          this.logger.debug(`Event ${eventName} delivered (attempt ${attempt + 1})`);
          return;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (err: any) {
        const errorMsg = err.message || 'unknown error';

        // Update delivery record
        if (deliveryId) {
          await this.prisma.eventBridgeDelivery.update({
            where: { id: deliveryId },
            data: {
              attempts: attempt + 1,
              lastAttemptAt: new Date(),
              lastError: errorMsg,
            },
          }).catch(() => {}); // Don't fail on tracking errors
        }

        // Retry if we have more delays
        if (attempt < this.retryDelays.length) {
          this.logger.warn(
            `Event ${eventName} delivery attempt ${attempt + 1} failed: ${errorMsg}. Retrying in ${this.retryDelays[attempt]}ms...`,
          );
          await this.sleep(this.retryDelays[attempt]);
        } else {
          this.logger.error(
            `Event ${eventName} delivery failed after ${attempt + 1} attempts. Dropping. Last error: ${errorMsg}`,
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // HMAC signing
  // -------------------------------------------------------------------------

  private sign(body: string): string {
    return createHmac('sha256', this.webhookSecret!)
      .update(body)
      .digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
