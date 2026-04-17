import {
  Controller, Get, Post, Patch, Param, Body, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CausesService } from './causes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('causes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('causes')
export class CausesController {
  constructor(private causesService: CausesService) {}

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.causesService.create(req.user?.id, body);
  }

  @Public()
  @Get()
  list(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.causesService.list({ category, search, page: page ? +page : 1 });
  }

  @Get('mine')
  getMine(@Request() req: any) {
    return this.causesService.getMine(req.user?.id);
  }

  // Admin endpoints
  @Get('admin/pending')
  adminPending(@Request() req: any) {
    return this.causesService.adminListPending(req.user?.id);
  }

  @Get('admin/withdrawals')
  adminWithdrawals(@Request() req: any) {
    return this.causesService.adminListWithdrawals(req.user?.id);
  }

  @Patch('admin/withdrawals/:wid/approve')
  adminApproveWithdrawal(
    @Request() req: any,
    @Param('wid') wid: string,
    @Body('notes') notes?: string,
  ) {
    return this.causesService.adminApproveWithdrawal(req.user?.id, wid, notes);
  }

  @Patch('admin/withdrawals/:wid/reject')
  adminRejectWithdrawal(
    @Request() req: any,
    @Param('wid') wid: string,
    @Body('notes') notes?: string,
  ) {
    return this.causesService.adminRejectWithdrawal(req.user?.id, wid, notes);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.causesService.getById(id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.causesService.update(req.user?.id, id, body);
  }

  @Post(':id/donate')
  donate(@Request() req: any, @Param('id') id: string, @Body() body: { amount: number; message?: string; isAnonymous?: boolean }) {
    return this.causesService.donate(req.user?.id, id, body);
  }

  @Public()
  @Get(':id/donors')
  getDonors(@Param('id') id: string, @Query('page') page?: string) {
    return this.causesService.getDonors(id, page ? +page : 1);
  }

  @Post(':id/updates')
  postUpdate(@Request() req: any, @Param('id') id: string, @Body() body: { text: string; photoUrl?: string }) {
    return this.causesService.postUpdate(req.user?.id, id, body);
  }

  @Public()
  @Get(':id/updates')
  getUpdates(@Param('id') id: string) {
    return this.causesService.getUpdates(id);
  }

  @Post(':id/withdraw')
  requestWithdrawal(@Request() req: any, @Param('id') id: string, @Body() body: { amount: number; method: string; destination: string }) {
    return this.causesService.requestWithdrawal(req.user?.id, id, body);
  }

  @Get(':id/withdrawals')
  getWithdrawals(@Request() req: any, @Param('id') id: string) {
    return this.causesService.getWithdrawals(req.user?.id, id);
  }

  @Patch(':id/admin/approve')
  adminApprove(@Request() req: any, @Param('id') id: string) {
    return this.causesService.adminApprove(req.user?.id, id);
  }

  @Patch(':id/admin/reject')
  adminReject(@Request() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.causesService.adminReject(req.user?.id, id, reason);
  }
}
