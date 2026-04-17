import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SittersService } from './sitters.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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

  // ─── Availability endpoints (authenticated sitter managing their own schedule) ──

  /** Get the authenticated sitter's own availability templates */
  @Get('availability')
  getMyAvailability(@Request() req: any) {
    return this.sittersService.getMyAvailability(req.user?.id);
  }

  /** Set/replace sitter weekly availability template */
  @Post('availability')
  setWeeklyTemplate(@Request() req: any, @Body('days') days: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    return this.sittersService.setWeeklyTemplate(req.user?.id, days || []);
  }

  /** Alias: PATCH also replaces the full weekly template */
  @Patch('availability')
  patchWeeklyTemplate(@Request() req: any, @Body('days') days: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    return this.sittersService.setWeeklyTemplate(req.user?.id, days || []);
  }

  /** Delete a single availability template slot by ID */
  @Delete('availability/:templateId')
  deleteAvailabilitySlot(@Request() req: any, @Param('templateId') templateId: string) {
    return this.sittersService.deleteAvailabilityTemplate(req.user?.id, templateId);
  }

  // ─── Public endpoints ──────────────────────────────────────────────────────

  /** Get a sitter's public availability by their profile ID */
  @Public()
  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query('date') date?: string) {
    return this.sittersService.getAvailability(id, date);
  }

  /** Get pricing tier, ranges, and current prices for any sitter */
  @Public()
  @Get(':id/pricing')
  getPricing(@Param('id') id: string) {
    return this.sittersService.getPricingInfo(id);
  }

  @Public()
  @Get(':id')
  getSitter(@Param('id') id: string) {
    return this.sittersService.findById(id);
  }

  @Public()
  @Get()
  findNearby(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    return this.sittersService.findNearby(+lat, +lng, radius ? +radius : 10);
  }
}
