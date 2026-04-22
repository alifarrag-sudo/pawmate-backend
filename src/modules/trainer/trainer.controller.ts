import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TrainerService } from './trainer.service';
import {
  ApplyTrainerDto,
  UpdateTrainerProfileDto,
  TrainerInstantCashoutDto,
  SearchTrainersDto,
  MarkSessionCompleteDto,
} from './trainer.dto';
import { documentFileFilter, uploadLimits } from '../uploads/uploads.service';

const ALLOWED_DOC_TYPES = [
  'profilePhoto',
  'idFront',
  'idBack',
  'certification',
  'showcaseVideo',
  'facilityPhoto',
] as const;

@ApiTags('trainer')
@Controller('trainer')
export class TrainerController {
  constructor(private readonly trainerService: TrainerService) {}

  // POST /trainer/apply
  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to become a Trainer' })
  apply(@Request() req: any, @Body() _dto: ApplyTrainerDto) {
    return this.trainerService.applyForTrainer(req.user.sub);
  }

  // PATCH /trainer/profile
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update Trainer profile fields (incremental)' })
  updateProfile(@Request() req: any, @Body() dto: UpdateTrainerProfileDto) {
    return this.trainerService.updateProfile(req.user.sub, dto);
  }

  // POST /trainer/documents/upload?documentType=...
  @Post('documents/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a trainer document (cert, ID, photo, video)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentType', 'file'],
      properties: {
        documentType: {
          type: 'string',
          enum: [...ALLOWED_DOC_TYPES],
        },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: documentFileFilter,
      limits: { fileSize: uploadLimits.fileSize },
    }),
  )
  async uploadDocument(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentType') documentType: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!(ALLOWED_DOC_TYPES as readonly string[]).includes(documentType)) {
      throw new BadRequestException(
        `Invalid documentType. Allowed: ${ALLOWED_DOC_TYPES.join(', ')}`,
      );
    }
    return this.trainerService.uploadDocument(
      req.user.sub,
      documentType as any,
      file.buffer,
      file.mimetype,
    );
  }

  // GET /trainer/me
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my Trainer profile with completion %' })
  getMyProfile(@Request() req: any) {
    return this.trainerService.getMyProfile(req.user.sub);
  }

  // GET /trainer/:id (public)
  @Get(':id')
  @ApiOperation({ summary: 'Get public Trainer profile' })
  @ApiParam({ name: 'id', description: 'TrainerProfile ID' })
  getPublicProfile(@Param('id') id: string) {
    return this.trainerService.getPublicProfile(id);
  }

  // POST /trainer/payout/instant
  @Post('payout/instant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request instant cashout (3% fee, min 100 EGP)' })
  instantCashout(@Request() req: any, @Body() _dto: TrainerInstantCashoutDto) {
    return this.trainerService.instantCashout(req.user.sub);
  }

  // POST /trainer/booking/:id/session-complete
  @Post('booking/:id/session-complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a session as complete (programs/packages)' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  markSessionComplete(
    @Request() req: any,
    @Param('id') bookingId: string,
    @Body() dto: MarkSessionCompleteDto,
  ) {
    return this.trainerService.markSessionComplete(req.user.sub, bookingId, dto);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /trainers (public search endpoint — separate controller for clean routing)
// ──────────────────────────────────────────────────────────────────────────────

@ApiTags('trainers')
@Controller('trainers')
export class TrainersSearchController {
  constructor(private readonly trainerService: TrainerService) {}

  @Get()
  @ApiOperation({ summary: 'Search trainers with filters' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'specialty', required: false })
  @ApiQuery({ name: 'deliveryMode', required: false })
  @ApiQuery({ name: 'page', required: false })
  search(
    @Query('city') city?: string,
    @Query('specialty') specialty?: string,
    @Query('deliveryMode') deliveryMode?: string,
    @Query('page') page?: string,
  ) {
    return this.trainerService.searchTrainers({
      city,
      specialty,
      deliveryMode,
      page: page ? parseInt(page, 10) : undefined,
    });
  }
}
