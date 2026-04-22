import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

class TrackEventDto {
  event_name: string;
  props?: Record<string, any>;
}

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('event')
  @ApiOperation({ summary: 'Track an analytics event' })
  async trackEvent(@Req() req: any, @Body() dto: TrackEventDto) {
    await this.analyticsService.trackEvent(
      req.user.id,
      dto.event_name,
      dto.props ?? {},
    );
    return { success: true };
  }
}
