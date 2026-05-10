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
import { PetFriendService } from './petfriend.service';
import {
  ApplyPetFriendDto,
  UpdatePetFriendProfileDto,
  InstantCashoutDto,
  SelectServicesDto,
} from './petfriend.dto';
import { documentFileFilter, uploadLimits } from '../uploads/uploads.service';

// Document field names accepted by the upload endpoint
const ALLOWED_DOCUMENT_FIELDS = [
  'idFrontUrl',
  'idBackUrl',
  'pccUrl',
  'selfieWithIdUrl',
  'profilePhotoUrl',
] as const;

type DocumentField = (typeof ALLOWED_DOCUMENT_FIELDS)[number];

@ApiTags('petfriend')
@Controller('petfriend')
export class PetFriendController {
  constructor(private readonly petFriendService: PetFriendService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // POST /petfriend/apply
  // ──────────────────────────────────────────────────────────────────────────
  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply to become a PetFriend',
    description:
      'Creates a PetFriend profile shell. Complete the profile incrementally via PATCH /petfriend/profile and document uploads.',
  })
  apply(@Request() req: any, @Body() _dto: ApplyPetFriendDto) {
    return this.petFriendService.applyForPetFriend(req.user.id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /petfriend/services
  // ──────────────────────────────────────────────────────────────────────────
  @Post('services')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Select which services this PetFriend will offer',
    description:
      'Idempotent. Writes one ProviderServiceEligibility row per selected service, ' +
      'and assigns the required training course based on the highest-risk service ' +
      'in the selection (BOARDING > DAY_CARE > WALKING). Re-calling replaces the ' +
      'eligibility set; rows for services no longer selected are deleted.',
  })
  selectServices(@Request() req: any, @Body() dto: SelectServicesDto) {
    return this.petFriendService.selectServices(req.user.id, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PATCH /petfriend/profile
  // ──────────────────────────────────────────────────────────────────────────
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update PetFriend profile fields',
    description:
      'Incrementally update profile fields. When all required fields are complete the profile is auto-approved.',
  })
  updateProfile(@Request() req: any, @Body() dto: UpdatePetFriendProfileDto) {
    return this.petFriendService.updateProfile(req.user.id, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /petfriend/documents/upload
  // ──────────────────────────────────────────────────────────────────────────
  @Post('documents/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a KYC document or profile photo',
    description:
      'Upload one of: idFrontUrl, idBackUrl, pccUrl, selfieWithIdUrl, profilePhotoUrl. ' +
      'Accepted formats: jpg, png, webp, gif, pdf.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['field', 'file'],
      properties: {
        field: {
          type: 'string',
          enum: [...ALLOWED_DOCUMENT_FIELDS],
          description: 'Which document field this file represents',
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
    @Query('field') field: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (!(ALLOWED_DOCUMENT_FIELDS as readonly string[]).includes(field)) {
      throw new BadRequestException(
        `Invalid field. Allowed: ${ALLOWED_DOCUMENT_FIELDS.join(', ')}`,
      );
    }
    return this.petFriendService.uploadDocument(
      req.user.id,
      field as DocumentField,
      file.buffer,
      file.mimetype,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /petfriend/me
  // ──────────────────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my PetFriend profile',
    description:
      'Returns full profile with completionPercent, missingFields[], and nextStep hint.',
  })
  getMyProfile(@Request() req: any) {
    return this.petFriendService.getMyProfile(req.user.id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET /petfriend/:id
  // ──────────────────────────────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({
    summary: 'Get public PetFriend profile',
    description:
      'Returns a public-safe subset of the profile. Only APPROVED profiles are visible.',
  })
  @ApiParam({ name: 'id', description: 'PetFriendProfile UUID' })
  getPublicProfile(@Param('id') id: string) {
    return this.petFriendService.getPublicProfile(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /petfriend/payout/instant
  // ──────────────────────────────────────────────────────────────────────────
  @Post('payout/instant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request an instant cashout',
    description:
      'Cashout available balance immediately. A 2% processing fee applies. Minimum 100 EGP required.',
  })
  instantCashout(@Request() req: any, @Body() _dto: InstantCashoutDto) {
    return this.petFriendService.instantCashout(req.user.id);
  }
}
