import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Admin } from '../../common/decorators/admin.decorator';
import { InvestorService } from './investor.service';
import { InviteInvestorDto } from './investor.dto';
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
}
