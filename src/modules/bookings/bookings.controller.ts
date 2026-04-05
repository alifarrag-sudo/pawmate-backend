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
}
