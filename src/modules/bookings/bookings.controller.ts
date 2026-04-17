import { Controller, Get, Post, Patch, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateBookingDto) {
    return this.bookingsService.createBooking(req.user?.id, dto);
  }

  @Get()
  getAll(
    @Request() req: any,
    @Query('role') role: 'owner' | 'sitter' = 'owner',
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.bookingsService.getMyBookings(req.user?.id, role, status, page ? +page : 1);
  }

  @Get('mine')
  getMyBookings(
    @Request() req: any,
    @Query('role') role: 'owner' | 'sitter' = 'owner',
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.bookingsService.getMyBookings(req.user?.id, role, status, page ? +page : 1);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.getBookingDetail(req.user?.id, id);
  }

  @Patch(':id/accept')
  accept(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.acceptBooking(req.user?.id, id);
  }

  @Patch(':id/decline')
  decline(@Request() req: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.bookingsService.declineBooking(req.user?.id, id, reason);
  }

  @Patch(':id/start')
  start(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.startService(req.user?.id, id);
  }

  @Patch(':id/complete')
  complete(@Request() req: any, @Param('id') id: string, @Body('notes') notes?: string) {
    return this.bookingsService.endService(req.user?.id, id, notes);
  }

  @Patch(':id/confirm')
  confirm(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.confirmCompletion(req.user?.id, id);
  }

  @Patch(':id/cancel')
  cancel(@Request() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.bookingsService.cancelBooking(req.user?.id, id, reason);
  }

  // ── Geo-locked pickup & overtime ────────────────────────────

  @Patch(':id/ready-for-pickup')
  readyForPickup(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.markReadyForPickup(req.user?.id, id);
  }

  @Get(':id/overtime')
  getOvertimeStatus(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.getOvertimeStatus(req.user?.id, id);
  }

  @Patch(':id/confirm-pickup')
  confirmPickup(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { ownerLat: number; ownerLng: number; overtimeAcknowledged: boolean },
  ) {
    return this.bookingsService.confirmPickup(req.user?.id, id, body);
  }

  @Patch(':id/force-complete')
  forceComplete(@Request() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.bookingsService.forceComplete(req.user?.id, id, reason);
  }

  // ── BookingEndCode ─────────────────────────────────────────────────────────

  /** Parent fetches the 4-digit service-end code for an active booking. */
  @Get(':id/end-code')
  getEndCode(@Request() req: any, @Param('id') id: string) {
    return this.bookingsService.getEndCode(req.user?.id, id);
  }

  /** PetFriend submits the 4-digit code to complete the service. */
  @Post(':id/verify-end-code')
  verifyEndCode(@Request() req: any, @Param('id') id: string, @Body('code') code: string) {
    return this.bookingsService.verifyEndCode(req.user?.id, id, code);
  }
}
