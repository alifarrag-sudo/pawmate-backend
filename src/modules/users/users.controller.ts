import {
  Controller, Get, Post, Patch, Param, Body, Query, Request,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@Request() req: any) {
    return this.usersService.getMe(req.user?.id);
  }

  @Patch('me')
  updateMe(
    @Request() req: any,
    @Body() body: { firstName?: string; lastName?: string; email?: string; language?: string },
  ) {
    return this.usersService.updateMe(req.user?.id, body);
  }

  @Patch('me/role')
  switchRole(@Request() req: any, @Body('activeRole') activeRole: 'owner' | 'sitter') {
    return this.usersService.switchRole(req.user?.id, activeRole);
  }

  @Get('me/notifications')
  getNotifications(@Request() req: any, @Query('page') page?: string) {
    return this.usersService.getNotifications(req.user?.id, page ? +page : 1);
  }

  @Post('me/notifications/read-all')
  markAllNotificationsRead(@Request() req: any) {
    return this.usersService.markAllNotificationsRead(req.user?.id);
  }

  @Post('me/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadProfilePhoto(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded. Send the image as form-data field "photo".');
    return this.usersService.updateProfilePhoto(req.user?.id, file.buffer);
  }

  @Post('me/fcm-token')
  registerFcmToken(
    @Request() req: any,
    @Body() body: { fcmToken: string; deviceType: 'ios' | 'android' },
  ) {
    if (!body.fcmToken) throw new BadRequestException('fcmToken is required.');
    if (!['ios', 'android'].includes(body.deviceType)) throw new BadRequestException('deviceType must be ios or android.');
    return this.usersService.registerFcmToken(req.user?.id, body.fcmToken, body.deviceType);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
