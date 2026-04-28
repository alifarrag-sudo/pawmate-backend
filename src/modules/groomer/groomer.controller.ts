import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Param,
  Body,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GroomerService } from './groomer.service';
import {
  ApplyGroomerDto,
  UpdateGroomerProfileDto,
  CreateServiceDto,
  UpdateServiceDto,
  StartAppointmentDto,
  CompleteAppointmentDto,
  UploadPhotosDto,
  ShareAppointmentDto,
  UpdateAllergyNotesDto,
} from './groomer.dto';

@ApiTags('groomer')
@Controller('groomer')
export class GroomerController {
  constructor(private readonly groomerService: GroomerService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Profile Management
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a groomer profile (requires GROOMING_SALON business)' })
  apply(@Request() req: any, @Body() dto: ApplyGroomerDto) {
    return this.groomerService.applyForGroomer(req.user.sub, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update groomer profile fields' })
  updateProfile(@Request() req: any, @Body() dto: UpdateGroomerProfileDto) {
    return this.groomerService.updateProfile(req.user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user groomer profile (operator view)' })
  getMyProfile(@Request() req: any) {
    return this.groomerService.getMyProfile(req.user.sub);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Get groomer public profile' })
  @ApiParam({ name: 'id', description: 'Groomer profile ID' })
  getPublicProfile(@Param('id') id: string) {
    return this.groomerService.getPublicProfile(id);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Search groomers' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'serviceType', required: false, description: 'GroomingServiceType enum value' })
  @ApiQuery({ name: 'mobileVan', required: false, type: Boolean, description: 'Filter by mobile van availability' })
  @ApiQuery({ name: 'acceptsDogs', required: false, type: Boolean })
  @ApiQuery({ name: 'acceptsCats', required: false, type: Boolean })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false })
  searchGroomers(
    @Query('city') city?: string,
    @Query('serviceType') serviceType?: string,
    @Query('mobileVan') mobileVan?: string,
    @Query('acceptsDogs') acceptsDogs?: string,
    @Query('acceptsCats') acceptsCats?: string,
    @Query('q') query?: string,
    @Query('page') page?: string,
  ) {
    return this.groomerService.searchGroomers({
      city,
      serviceType,
      mobileVan: mobileVan === 'true',
      acceptsDogs: acceptsDogs !== undefined ? acceptsDogs === 'true' : undefined,
      acceptsCats: acceptsCats !== undefined ? acceptsCats === 'true' : undefined,
      query,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Service Management
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('services')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new grooming service' })
  createService(@Request() req: any, @Body() dto: CreateServiceDto) {
    return this.groomerService.createService(req.user.sub, dto);
  }

  @Patch('services/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a grooming service' })
  @ApiParam({ name: 'id', description: 'Service ID' })
  updateService(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.groomerService.updateService(req.user.sub, id, dto);
  }

  @Delete('services/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a grooming service (marks inactive)' })
  @ApiParam({ name: 'id', description: 'Service ID' })
  deleteService(@Request() req: any, @Param('id') id: string) {
    return this.groomerService.deleteService(req.user.sub, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Availability
  // ═══════════════════════════════════════════════════════════════════════════

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get time slot availability for a groomer on a given date' })
  @ApiParam({ name: 'id', description: 'Groomer profile ID' })
  @ApiQuery({ name: 'date', description: 'Date (YYYY-MM-DD)', required: true })
  getAvailability(
    @Param('id') id: string,
    @Query('date') date: string,
  ) {
    return this.groomerService.getAvailability(id, date);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Appointment Operations
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('appointments/:id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a grooming appointment (sets IN_PROGRESS)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  startAppointment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: StartAppointmentDto,
  ) {
    return this.groomerService.startAppointment(req.user.sub, id, dto);
  }

  @Post('appointments/:id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete a grooming appointment (sets COMPLETED, updates pet allergy info)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  completeAppointment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CompleteAppointmentDto,
  ) {
    return this.groomerService.completeAppointment(req.user.sub, id, dto);
  }

  @Post('appointments/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a grooming appointment' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  cancelAppointment(@Request() req: any, @Param('id') id: string) {
    return this.groomerService.cancelAppointment(req.user.sub, id);
  }

  @Post('appointments/:id/no-show')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark appointment as no-show' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  markNoShow(@Request() req: any, @Param('id') id: string) {
    return this.groomerService.markNoShow(req.user.sub, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Photo Uploads
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('appointments/:id/before-photos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload before-grooming photos' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  uploadBeforePhotos(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UploadPhotosDto,
  ) {
    return this.groomerService.uploadBeforePhotos(req.user.sub, id, dto);
  }

  @Post('appointments/:id/after-photos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload after-grooming photos' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  uploadAfterPhotos(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UploadPhotosDto,
  ) {
    return this.groomerService.uploadAfterPhotos(req.user.sub, id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Share Token
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('appointments/:id/share')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a shareable link for a completed appointment (90-day TTL)' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  generateShareToken(@Request() req: any, @Param('id') id: string) {
    return this.groomerService.generateShareToken(req.user.sub, id);
  }

  @Public()
  @Get('share/:token')
  @ApiOperation({ summary: 'View shared grooming appointment (public, no JWT required)' })
  @ApiParam({ name: 'token', description: 'Share token (16-char hex)' })
  getPublicShare(@Param('token') token: string) {
    return this.groomerService.getPublicShare(token);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Allergy Notes
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('appointments/:id/allergy-notes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Append allergy notes to the pet grooming record' })
  @ApiParam({ name: 'id', description: 'Appointment ID' })
  updateAllergyNotes(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAllergyNotesDto,
  ) {
    return this.groomerService.updateAllergyNotes(req.user.sub, id, dto);
  }
}
