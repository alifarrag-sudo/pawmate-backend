import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Request,
  UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PetsService } from './pets.service';
import { UploadsService } from '../uploads/uploads.service';

@ApiTags('pets')
@ApiBearerAuth()
@Controller('pets')
export class PetsController {
  constructor(
    private petsService: PetsService,
    private uploads: UploadsService,
  ) {}

  @Get('debug')
  async debugPets(@Request() req: any) {
    try {
      const result = await this.petsService.findByOwner(req.user?.id);
      return { ok: true, count: result.length };
    } catch (err: any) {
      return { ok: false, error: err?.message, code: err?.code, stack: err?.stack?.split('\n').slice(0, 5) };
    }
  }

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
