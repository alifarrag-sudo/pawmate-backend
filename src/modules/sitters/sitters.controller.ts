import { Controller, Get, Post, Patch, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SittersService } from './sitters.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('sitters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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

  /** Sitter updates their per-service prices */
  @Patch('profile/pricing')
  updatePricing(@Request() req: any, @Body() body: any) {
    return this.sittersService.updateServicePricing(req.user?.id, body);
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query('date') date?: string) {
    return this.sittersService.getAvailability(id, date);
  }

  /** Get pricing tier, ranges, and current prices for any sitter */
  @Get(':id/pricing')
  getPricing(@Param('id') id: string) {
    return this.sittersService.getPricingInfo(id);
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
