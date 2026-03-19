import { Controller, Get, Post, Param, Body, Headers, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('wallet')
  getWallet(@Request() req: any) {
    return this.paymentsService.getWalletBalance(req.user?.id);
  }

  @Get('wallet/balance')
  getWalletBalance(@Request() req: any) {
    return this.paymentsService.getWalletBalance(req.user?.id);
  }

  @Post('wallet/top-up')
  topUpWallet(@Request() req: any, @Body('amount') amount: number) {
    return this.paymentsService.topUpWallet(req.user?.id, amount);
  }

  @Get('history')
  getTransactionHistory(@Request() req: any) {
    return this.paymentsService.getTransactionHistory(req.user?.id);
  }

  @Get('payouts')
  getPayouts(@Request() req: any) {
    return this.paymentsService.getPayoutHistory(req.user?.id);
  }

  @Post('payouts/withdraw')
  requestWithdrawal(
    @Request() req: any,
    @Body('amount') amount: number,
    @Body('method') method: string,
  ) {
    return this.paymentsService.requestWithdrawal(req.user?.id, amount, method);
  }

  @Post('webhook/paymob')
  paymobWebhook(@Body() payload: any, @Headers('hmac') signature: string) {
    return this.paymentsService.handlePaymobWebhook(payload, signature);
  }
}
