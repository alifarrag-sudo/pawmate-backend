import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MeetGreetService } from './meet-greet.service';
import { RecordMeetGreetConsentDto } from './meet-greet.dto';
import {
  CONSENT_TEXT_VERSION,
  CONSENT_TEXT_EN,
  CONSENT_TEXT_AR,
} from './meet-greet.constants';

/**
 * Mounted under `/bookings/:id/meet-greet/*` rather than its own root
 * so the URL space stays organised around the booking aggregate.
 */
@ApiTags('meet-greet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings/:id/meet-greet')
export class MeetGreetController {
  constructor(private readonly meetGreet: MeetGreetService) {}

  @Post('consent')
  @ApiOperation({
    summary: 'Record parent Meet & Greet consent for a booking',
    description:
      'Parent JWT required. Booking must be BOARDING or DAY_CARE. ' +
      'Requires consentTextVersion to be present in body. With ' +
      'MEET_GREET_BLOCKS_PAYMENT=false the response always has ' +
      'blocked=false; future flag flip will gate payment.',
  })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  recordConsent(
    @Request() req: any,
    @Param('id') bookingId: string,
    @Body() dto: RecordMeetGreetConsentDto,
  ) {
    return this.meetGreet.recordConsent(req.user.id, bookingId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get Meet & Greet consent for a booking',
    description:
      'Returns the consent row if one exists, otherwise null. ' +
      'Both parent and provider JWTs are permitted.',
  })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  getConsent(@Request() req: any, @Param('id') bookingId: string) {
    return this.meetGreet.getConsent(req.user.id, bookingId);
  }

  /**
   * Surface the current consent-text version + bilingual snapshot so the
   * mobile client can render the exact wording it'll be agreeing to and
   * pass back the matching version on POST.
   */
  @Get('text')
  @ApiOperation({
    summary: 'Get the current Meet & Greet consent text (versioned, EN + AR)',
  })
  getConsentText() {
    return {
      version: CONSENT_TEXT_VERSION,
      en: CONSENT_TEXT_EN,
      ar: CONSENT_TEXT_AR,
    };
  }
}
