import { Controller, UseGuards, Get, Post, Body, Headers, Param, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('wallet')
  getWallet(@Request() req: any) {
    return this.paymentsService.getWalletBalance(req.user?.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('wallet/balance')
  getWalletBalance(@Request() req: any) {
    return this.paymentsService.getWalletBalance(req.user?.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('wallet/top-up')
  topUpWallet(@Request() req: any, @Body('amount') amount: number, @Body('paymentMethod') paymentMethod: string) {
    return this.paymentsService.topUpWallet(req.user?.id, amount, paymentMethod);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('history')
  getTransactionHistory(@Request() req: any) {
    return this.paymentsService.getTransactionHistory(req.user?.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('payouts')
  getPayouts(@Request() req: any) {
    return this.paymentsService.getPayoutHistory(req.user?.id, req.user?.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('payouts/withdraw')
  requestWithdrawal(
    @Request() req: any,
    @Body('amount') amount: number,
    @Body('method') method: string,
  ) {
    return this.paymentsService.requestWithdrawal(req.user?.id, amount, method);
  }

  // ── Paymob payment intent + status (mobile + web pre-payment flow) ──

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('paymob/intent')
  @ApiOperation({ summary: 'Create Paymob payment intent for a booking' })
  createPaymobIntent(@Request() req: any, @Body('bookingId') bookingId: string) {
    return this.paymentsService.createPaymobIntent(req.user?.id, bookingId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('paymob/status/:bookingId')
  @ApiOperation({ summary: 'Get current Paymob payment status for a booking' })
  getPaymobStatus(@Request() req: any, @Param('bookingId') bookingId: string) {
    return this.paymentsService.getPaymobStatus(req.user?.id, bookingId);
  }

  // No JWT — Paymob signs with HMAC. Validation in service layer.
  @Post('webhook/paymob')
  paymobWebhook(@Body() payload: any, @Headers('hmac') signature: string) {
    return this.paymentsService.handlePaymobWebhook(payload, signature);
  }
}
