import { Controller, Get, Post, Patch, Param, Body, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SittersService } from './sitters.service';

@ApiTags('sitters')
@ApiBearerAuth()
@Controller('sitters')
export class SittersController {
  constructor(private sittersService: SittersService) {}

  @Get('profile')
  getMyProfile(@Request() req: any) {
    return this.sittersService.getMyProfile(req.user?.id);
  }

  @Post('profile')
  createProfile(@Request() req: any, @Body() body: any) {
    return this.sittersService.createProfile(req.user?.id, body);
  }

  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: any) {
    return this.sittersService.updateProfile(req.user?.id, body);
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query('date') date?: string) {
    return this.sittersService.getAvailability(id, date);
  }

  @Get(':id')
  getSitter(@Param('id') id: string) {
    return this.sittersService.findById(id);
  }

  @Get()
  findNearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    return this.sittersService.findNearby(+lat, +lng, radius ? +radius : 10);
  }
}
