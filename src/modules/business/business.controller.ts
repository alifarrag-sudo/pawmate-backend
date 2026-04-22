import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
  Request,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
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
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessService } from './business.service';
import {
  ApplyBusinessDto,
  UpdateBusinessProfileDto,
  CreateBranchDto,
  CreateTeamInviteDto,
  DirectCreateTeamMemberDto,
  JoinTeamDto,
  UpdateTeamMemberDto,
  SuspendTeamMemberDto,
} from './business.dto';
import { documentFileFilter, uploadLimits } from '../uploads/uploads.service';

const DOC_TYPES = ['logo', 'coverPhoto', 'commercialRegDoc', 'taxCard', 'photo'] as const;

@ApiTags('business')
@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  // ── Part B: Business Profile ─────────────────────────────────────────────

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a business' })
  apply(@Request() req: any, @Body() dto: ApplyBusinessDto) {
    return this.businessService.applyForBusiness(req.user.sub, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update business profile' })
  updateProfile(@Request() req: any, @Body() dto: UpdateBusinessProfileDto) {
    return this.businessService.updateProfile(req.user.sub, dto);
  }

  @Post('documents/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload business document (logo, taxCard, etc.)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentType', 'file'],
      properties: {
        documentType: { type: 'string', enum: [...DOC_TYPES] },
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
  uploadDocument(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentType') documentType: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!(DOC_TYPES as readonly string[]).includes(documentType)) {
      throw new BadRequestException(`Invalid documentType. Allowed: ${DOC_TYPES.join(', ')}`);
    }
    return this.businessService.uploadDocument(req.user.sub, documentType as any, file.buffer, file.mimetype);
  }

  @Post('branches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a branch location' })
  createBranch(@Request() req: any, @Body() dto: CreateBranchDto) {
    return this.businessService.createBranch(req.user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my business profile + team + branches' })
  getMyBusiness(@Request() req: any) {
    return this.businessService.getMyBusiness(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public business profile' })
  @ApiParam({ name: 'id', description: 'Business profile ID' })
  getPublicBusiness(@Param('id') id: string) {
    return this.businessService.getPublicBusiness(id);
  }

  // ── Part C: Team Management ──────────────────────────────────────────────

  @Post(':id/team/invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create team invite link' })
  @ApiParam({ name: 'id', description: 'Business ID' })
  createInvite(@Request() req: any, @Param('id') id: string, @Body() dto: CreateTeamInviteDto) {
    return this.businessService.createInvite(req.user.sub, id, dto);
  }

  @Post(':id/team/direct-create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Directly create a team member account' })
  @ApiParam({ name: 'id', description: 'Business ID' })
  directCreate(@Request() req: any, @Param('id') id: string, @Body() dto: DirectCreateTeamMemberDto) {
    return this.businessService.directCreateMember(req.user.sub, id, dto);
  }

  @Get(':id/team')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get team list with filters' })
  @ApiParam({ name: 'id', description: 'Business ID' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'providerType', required: false })
  getTeam(
    @Request() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('providerType') providerType?: string,
  ) {
    return this.businessService.getTeamList(req.user.sub, id, { status, providerType });
  }

  @Patch(':id/team/:memberId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update team member permissions' })
  updateMember(
    @Request() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.businessService.updateTeamMember(req.user.sub, id, memberId, dto);
  }

  @Post(':id/team/:memberId/suspend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend a team member' })
  suspendMember(
    @Request() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: SuspendTeamMemberDto,
  ) {
    return this.businessService.suspendTeamMember(req.user.sub, id, memberId, dto);
  }

  @Post(':id/team/:memberId/remove')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a team member' })
  removeMember(
    @Request() req: any,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.businessService.removeTeamMember(req.user.sub, id, memberId);
  }

  @Delete(':id/team/invite/:inviteId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a pending invite' })
  revokeInvite(
    @Request() req: any,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.businessService.revokeInvite(req.user.sub, id, inviteId);
  }
}

// ── Team-level endpoints (no business ID in path) ──────────────────────────

@ApiTags('team')
@Controller('team')
export class TeamController {
  constructor(private readonly businessService: BusinessService) {}

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join a business via invite code' })
  joinTeam(@Request() req: any, @Body() dto: JoinTeamDto) {
    return this.businessService.joinTeam(req.user.sub, dto.inviteCode);
  }

  @Get('my-memberships')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my team memberships' })
  getMyMemberships(@Request() req: any) {
    return this.businessService.getMyMemberships(req.user.sub);
  }

  @Post('leave/:membershipId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a business team' })
  leaveTeam(@Request() req: any, @Param('membershipId') membershipId: string) {
    return this.businessService.leaveTeam(req.user.sub, membershipId);
  }
}

// ── Public business search ─────────────────────────────────────────────────

@ApiTags('businesses')
@Controller('businesses')
export class BusinessesSearchController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  @ApiOperation({ summary: 'Search businesses' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'page', required: false })
  search(
    @Query('city') city?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
  ) {
    return this.businessService.searchBusinesses(city, type, page ? parseInt(page, 10) : undefined);
  }
}
