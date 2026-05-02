import { Controller, UseGuards, Get, Patch, Post, Query, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  getNotifications(@Request() req: any, @Query('page') page?: string) {
    return this.notificationsService.getNotifications(req.user?.id, page ? +page : 1);
  }

  // Mobile reads only this number for the bell badge — keep the endpoint
  // cheap (no list, no envelope rewrite).
  @Get('unread-count')
  getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user?.id);
  }

  // Mobile uses POST; older internal callers use PATCH. Both routes share
  // the same handler so we don't break either client during the rollout.
  @Patch('read-all')
  @Post('read-all')
  markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user?.id);
  }
}
