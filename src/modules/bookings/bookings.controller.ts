import { Controller, Get, Post, Patch, Param, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RecordPickupDto } from '../pricing/dto/record-pickup.dto';
import { PricingService } from '../pricing/pricing.service';
import { OperatorService } from '../providers/operator.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private bookingsService: BookingsService,
    private pricingService: PricingService,
    private operatorService: OperatorService,
  ) {}

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

  // Operator-scoped list — bookings across the calling operator's team.
  // Must be declared BEFORE @Get(':id') to avoid 'operator' being captured
  // as a booking id.
  @Get('operator')
  @ApiOperation({ summary: 'Bookings across the operator\'s team' })
  getOperatorBookings(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('memberId') memberId?: string,
    @Query('serviceType') serviceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.operatorService.listBookings(req.user?.id, {
      status,
      memberId,
      serviceType,
      from,
      to,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
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

  // ── Late-pickup recording (BOARDING / DAY_CARE) ──────────────────────────────

  /**
   * Record actual pickup time and persist the late-pickup fee.
   * Returns { lateFeeEgp, hoursLate, charged }. The Paymob charge for the late
   * fee is enqueued by the bookings service in a follow-up; this endpoint only
   * computes and persists.
   */
  @Post(':id/record-pickup')
  @ApiOperation({ summary: 'Record actual pickup time and calculate late fee' })
  async recordPickup(@Param('id') id: string, @Body() dto: RecordPickupDto) {
    const pickupTime = dto.pickupTime ? new Date(dto.pickupTime) : new Date();
    const result = await this.pricingService.recordPickup(id, pickupTime);
    return {
      lateFeeEgp: result.fee,
      hoursLate: result.hoursLate,
      charged: result.charged,
    };
  }
}
