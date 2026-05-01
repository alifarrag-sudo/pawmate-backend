import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Request,
  UseInterceptors, UploadedFiles, BadRequestException, UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('pets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pets')
export class PetsController {
  constructor(
    private petsService: PetsService,
    private uploads: UploadsService,
  ) {}

  @Get()
  getMyPets(@Request() req: any) {
    return this.petsService.findByOwner(req.user?.id);
  }

  @Get(':id')
  getOne(@Request() req: any, @Param('id') id: string) {
    return this.petsService.findOne(req.user?.id, id);
  }

  @Post('wizard')
  createWizard(@Request() req: any, @Body() body: any) {
    return this.petsService.upsertFullProfile(req.user?.id, null, body);
  }

  @Put(':id/wizard')
  updateWizard(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.upsertFullProfile(req.user?.id, id, body);
  }

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.petsService.create(req.user?.id, body);
  }

  // ── Medical subresources ──────────────────────────────────────────────────
  // These routes MUST stay above `@Patch(':id')` / `@Delete(':id')` so the
  // `:id/<subresource>` paths don't get captured by the bare `:id` matcher.

  @Get(':id/vaccinations')
  listVaccinations(@Request() req: any, @Param('id') id: string) {
    return this.petsService.listVaccinations(req.user?.id, id);
  }

  @Post(':id/vaccinations')
  addVaccination(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.addVaccination(req.user?.id, id, body);
  }

  @Delete(':id/vaccinations/:vaccinationId')
  deleteVaccination(
    @Request() req: any,
    @Param('id') id: string,
    @Param('vaccinationId') vaccinationId: string,
  ) {
    return this.petsService.deleteVaccination(req.user?.id, id, vaccinationId);
  }

  @Get(':id/medications')
  listMedications(@Request() req: any, @Param('id') id: string) {
    return this.petsService.listMedications(req.user?.id, id);
  }

  @Post(':id/medications')
  addMedication(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.addMedication(req.user?.id, id, body);
  }

  @Delete(':id/medications/:medicationId')
  deleteMedication(
    @Request() req: any,
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
  ) {
    return this.petsService.deleteMedication(req.user?.id, id, medicationId);
  }

  @Get(':id/schedules')
  listSchedules(@Request() req: any, @Param('id') id: string) {
    return this.petsService.listSchedules(req.user?.id, id);
  }

  // Mobile sends the same shape to /schedule (singular) and /schedules.
  // Accept both so older clients keep working during the rollout.
  @Get(':id/schedule')
  listSchedulesAlias(@Request() req: any, @Param('id') id: string) {
    return this.petsService.listSchedules(req.user?.id, id);
  }

  @Post(':id/schedules')
  addSchedule(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.addSchedule(req.user?.id, id, body);
  }

  @Post(':id/schedule')
  addScheduleAlias(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.addSchedule(req.user?.id, id, body);
  }

  @Get(':id/behavior')
  getBehavior(@Request() req: any, @Param('id') id: string) {
    return this.petsService.getBehavior(req.user?.id, id);
  }

  @Patch(':id/behavior')
  updateBehavior(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.upsertBehavior(req.user?.id, id, body);
  }

  // ── Bare :id routes (must come last) ──────────────────────────────────────

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.petsService.update(req.user?.id, id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.petsService.softDelete(req.user?.id, id);
  }

  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 5, { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadPhotos(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No files uploaded. Send images as form-data field "photos".');
    const urls = await Promise.all(
      files.map(f => this.uploads.uploadImage(f.buffer, 'pet_photos', { maxWidth: 800 })),
    );
    const photoUrls = urls.map(r => r.url);
    await this.petsService.addPhotos(req.user?.id, id, photoUrls);
    return { photos: photoUrls };
  }

  @Get('owner/:ownerId')
  getPetsByOwner(@Param('ownerId') ownerId: string) {
    return this.petsService.findByOwner(ownerId);
  }
}
