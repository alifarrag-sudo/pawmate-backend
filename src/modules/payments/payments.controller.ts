import { Controller, UseGuards, Get, Post, Body, Headers, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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

  // No JWT — Paymob signs with HMAC. Validation in service layer.
  @Post('webhook/paymob')
  paymobWebhook(@Body() payload: any, @Headers('hmac') signature: string) {
    return this.paymentsService.handlePaymobWebhook(payload, signature);
  }
}
