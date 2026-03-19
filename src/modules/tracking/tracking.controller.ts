import { Controller, Get, Post, Patch, Param, Body, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Post('sessions/start')
  startSession(@Request() req: any, @Body('taskId') taskId: string) {
    return this.trackingService.startWalkSession(req.user?.id, taskId);
  }

  @Get('sessions/:sessionId')
  getSession(@Request() req: any, @Param('sessionId') sessionId: string) {
    return this.trackingService.getLiveWalkData(sessionId, req.user?.id);
  }

  @Patch('sessions/:sessionId/end')
  endSession(@Request() req: any, @Param('sessionId') sessionId: string, @Body('notes') notes?: string) {
    return this.trackingService.endWalkSession(sessionId, req.user?.id, notes);
  }
}
