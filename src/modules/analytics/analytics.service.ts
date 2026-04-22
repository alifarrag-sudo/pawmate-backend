import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async trackEvent(
    userId: string,
    eventName: string,
    props: Record<string, any>,
  ): Promise<void> {
    // Log for now — Prompt 19 will add dashboard via pawmate_events bridge
    this.logger.log(
      `[ANALYTICS] user=${userId} event=${eventName} props=${JSON.stringify(props)}`,
    );
  }
}
