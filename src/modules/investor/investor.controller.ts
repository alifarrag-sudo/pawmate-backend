import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Admin } from '../../common/decorators/admin.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InvestorService } from './investor.service';
import {
  InviteInvestorDto,
  SendMessageDto,
  CreateInvestorUpdateDto,
  UploadInvestorDocDto,
} from './investor.dto';
import { InvestorGuard } from './investor.guard';

@ApiTags('investor')
@ApiBearerAuth()
@Controller('')
export class InvestorController {
  constructor(private readonly investorService: InvestorService) {}

  /**
   * POST /api/v1/admin/investors/invite
   *
   * Admin-only. Creates or upgrades a user with the INVESTOR role and sends
   * a one-time login link valid for 7 days. Leverages the existing auth module
   * OLT flow at POST /api/v1/auth/one-time-login.
   */
  @Admin()
  @Post('admin/investors/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invite an investor — creates account + sends one-time login link (admin only)',
    description:
      'If the email already exists, the INVESTOR role is added to the existing account. ' +
      'The generated login link uses the existing POST /auth/one-time-login flow.',
  })
  async inviteInvestor(@Body() dto: InviteInvestorDto) {
    return this.investorService.inviteInvestor(dto);
  }

  /**
   * GET /api/v1/investor/metrics
   *
   * Returns anonymised platform KPIs for investor review. Requires the
   * INVESTOR (or admin) role.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/metrics')
  @ApiOperation({
    summary: 'Get anonymised platform metrics for investor portal (investor role required)',
  })
  async getMetrics() {
    return this.investorService.getMetrics();
  }

  /**
   * GET /api/v1/investor/metrics/detailed
   *
   * Returns expanded metrics with monthly time series for the last 12 months,
   * unit economics, geographic breakdown, and provider analytics.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/metrics/detailed')
  @ApiOperation({
    summary: 'Get detailed platform metrics with 12-month time series (investor role required)',
  })
  async getMetricsDetailed() {
    return this.investorService.getMetricsDetailed();
  }

  /**
   * GET /api/v1/investor/documents
   *
   * Returns the list of investor documents (pitch deck, financials, data room).
   * Requires the INVESTOR (or admin) role. Emits investor.document_accessed.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/documents')
  @ApiOperation({
    summary: 'List investor documents available in the data room (investor role required)',
  })
  async getDocuments() {
    return this.investorService.getDocuments();
  }

  /**
   * GET /api/v1/investor/documents/:id/url
   *
   * Returns a signed Cloudinary URL with short TTL for the specified document.
   * Emits investor.document_downloaded event.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/documents/:id/url')
  @ApiOperation({
    summary: 'Get a signed download URL for an investor document (investor role required)',
  })
  async getDocumentUrl(@Param('id') id: string) {
    return this.investorService.getDocumentUrl(id);
  }

  /**
   * GET /api/v1/investor/safe-note
   *
   * Returns the logged-in investor's SAFE note data.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/safe-note')
  @ApiOperation({
    summary: 'Get SAFE note details for the current investor (investor role required)',
  })
  async getSafeNote(@CurrentUser('sub') userId: string) {
    return this.investorService.getSafeNote(userId);
  }

  /**
   * GET /api/v1/investor/updates
   *
   * Returns list of investor updates sorted newest first.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/updates')
  @ApiOperation({
    summary: 'List investor updates / newsletters (investor role required)',
  })
  async getUpdates() {
    return this.investorService.getUpdates();
  }

  /**
   * GET /api/v1/investor/messages
   *
   * Returns investor message thread.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Get('investor/messages')
  @ApiOperation({
    summary: 'List messages in the investor thread (investor role required)',
  })
  async getMessages() {
    return this.investorService.getMessages();
  }

  /**
   * POST /api/v1/investor/messages
   *
   * Send a message from the investor to the founding team.
   */
  @UseGuards(JwtAuthGuard, InvestorGuard)
  @Post('investor/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message to the founding team (investor role required)',
  })
  async sendMessage(
    @CurrentUser('sub') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.investorService.sendMessage(userId, dto);
  }

  /**
   * POST /api/v1/admin/investor-updates
   *
   * Admin-only. Create a new investor update / newsletter.
   */
  @Admin()
  @Post('admin/investor-updates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new investor update (admin only)',
  })
  async createInvestorUpdate(@Body() dto: CreateInvestorUpdateDto) {
    return this.investorService.createInvestorUpdate(dto);
  }

  /**
   * POST /api/v1/admin/investor-docs/upload
   *
   * Admin-only. Upload a new investor document to the data room.
   */
  @Admin()
  @Post('admin/investor-docs/upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload an investor document to the data room (admin only)',
  })
  async uploadInvestorDoc(@Body() dto: UploadInvestorDocDto) {
    return this.investorService.uploadInvestorDoc(dto);
  }
}
