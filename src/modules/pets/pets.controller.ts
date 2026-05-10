import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Request,
  UseInterceptors, UploadedFiles, UploadedFile, BadRequestException, UseGuards,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { UploadsService } from '../uploads/uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  uploadFileFilter,
  uploadFileLimits,
  validateUploadedFile,
} from '../../common/validators/file-upload.validator';

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

  // ── G1: Vaccination passport (private storage + signed URL) ──────────────

  @Post(':id/vaccination-upload')
  @ApiOperation({
    summary: 'Upload a vaccination passport for this pet',
    description:
      'Stores the file in private Cloudinary storage and persists only the ' +
      'storage key. Reads happen via GET /pets/:id/vaccination-url which ' +
      'mints a 15-minute signed URL.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: uploadFileFilter,
      limits: uploadFileLimits,
    }),
  )
  uploadVaccination(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    validateUploadedFile(file);
    return this.petsService.uploadVaccinationPassport(req.user?.id, id, file);
  }

  @Get(':id/vaccination-url')
  @ApiOperation({
    summary: 'Get a 15-min signed URL to read the vaccination passport',
  })
  getVaccinationUrl(@Request() req: any, @Param('id') id: string) {
    return this.petsService.getVaccinationSignedUrl(req.user?.id, id);
  }

  @Post(':id/licence')
  @ApiOperation({
    summary: 'Submit an Egyptian pet licence number + governorate',
    description:
      'The licence number is encrypted with MedicalEncryptionService before ' +
      'storage; plaintext is never written to disk. Governorate is plain.',
  })
  submitLicence(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { licenceNumber: string; governorate: string },
  ) {
    return this.petsService.submitLicence(req.user?.id, id, body);
  }

  @Get('owner/:ownerId')
  getPetsByOwner(@Param('ownerId') ownerId: string) {
    return this.petsService.findByOwner(ownerId);
  }
}

// Admin-side verification endpoint — separate controller so the AdminGuard
// is scoped to it without changing the parent controller's JwtAuthGuard.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/pets')
export class AdminPetsController {
  constructor(private petsService: PetsService) {}

  @Post(':id/verify-vaccination')
  @ApiOperation({
    summary: 'Approve or reject a pet vaccination passport (admin only)',
  })
  verifyVaccination(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { verified: boolean; expiresAt?: string },
  ) {
    return this.petsService.verifyVaccination(req.user?.id, id, body);
  }
}
