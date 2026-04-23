import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { WebApplicationService } from './web-application.service';
import { SaveProgressDto, ResumeApplicationDto } from './web-application.dto';

@ApiTags('web-application')
@Controller('web/application')
export class WebApplicationController {
  constructor(private readonly webApplicationService: WebApplicationService) {}

  /**
   * POST /api/v1/web/application/save-progress
   *
   * Saves or updates a multi-step provider application draft. Works for both
   * authenticated users (keyed on userId) and unauthenticated visitors (keyed
   * on the email in the step data). Emits web.application_started on step 1
   * and web.application_step_completed on subsequent steps.
   */
  @Public()
  @Post('save-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save or update a web provider application draft (supports guest and authenticated users)',
    description:
      'Upserts the draft keyed on userId (authenticated) or email (guest). ' +
      'Emits web.application_started on step 1, web.application_step_completed on later steps.',
  })
  async saveProgress(@Body() dto: SaveProgressDto, @Req() req: Request) {
    const userId: string | null = (req.user as any)?.sub ?? null;
    return this.webApplicationService.saveProgress(userId, dto);
  }

  /**
   * GET /api/v1/web/application/my-draft
   *
   * Returns the authenticated user in-progress draft. Requires JWT.
   */
  @UseGuards(JwtAuthGuard)
  @Get('my-draft')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retrieve the current authenticated user saved application draft',
  })
  async getMyDraft(@CurrentUser('sub') userId: string) {
    return this.webApplicationService.getMyDraft(userId);
  }

  /**
   * POST /api/v1/web/application/resume
   *
   * Resumes a previously saved draft. Authenticated users are identified by
   * JWT; guests must supply their email in the body. Emits web.application_resumed.
   */
  @Public()
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume a saved application draft (authenticated or by email for guests)',
    description: 'Emits web.application_resumed. Returns the saved step and data.',
  })
  async resumeApplication(@Body() dto: ResumeApplicationDto, @Req() req: Request) {
    const userId: string | null = (req.user as any)?.sub ?? null;
    return this.webApplicationService.resumeApplication(userId, dto);
  }
}
