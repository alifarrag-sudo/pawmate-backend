import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReferralsService } from './referrals.service';

class RedeemCodeDto {
  code: string;
}

@ApiTags('referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post('share')
  @ApiOperation({ summary: 'Get referral code and share copy' })
  async getShareInfo(@Req() req: any) {
    return this.referralsService.getShareInfo(req.user.id);
  }

  @Post('redeem')
  @ApiOperation({ summary: 'Redeem a referral code during signup' })
  async redeemCode(@Req() req: any, @Body() dto: RedeemCodeDto) {
    await this.referralsService.redeemCode(dto.code, req.user.id);
    return { success: true, message: 'Referral code applied' };
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my referral history and stats' })
  async getMyReferrals(@Req() req: any) {
    return this.referralsService.getMyReferrals(req.user.id);
  }

  @Post('backfill')
  @ApiOperation({ summary: 'Backfill referral codes for existing users (admin)' })
  async backfill() {
    const count = await this.referralsService.backfillReferralCodes();
    return { success: true, count };
  }
}
