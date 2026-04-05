import { Controller, Get, Post, Param, Body, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CareLogService } from './care-log.service';

@ApiTags('care-log')
@ApiBearerAuth()
@Controller('care-log')
export class CareLogController {
  constructor(private careLogService: CareLogService) {}

  @Get('booking/:bookingId')
  getByBooking(@Param('bookingId') bookingId: string) {
    return this.careLogService.getByBooking(bookingId);
  }

  @Post(':careLogId/complete')
  markComplete(
    @Request() req: any,
    @Param('careLogId') careLogId: string,
    @Body() body: { notes?: string },
  ) {
    return this.careLogService.markComplete(req.user?.id, careLogId, body.notes);
  }
}
