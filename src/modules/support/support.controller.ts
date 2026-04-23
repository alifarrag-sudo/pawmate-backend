import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SupportService } from './support.service';
import { CreateContactDto } from './support.dto';

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * POST /api/v1/support/contact
   *
   * Public endpoint — no authentication required. Accepts web contact-form
   * submissions from the PawMateHub marketing site and stores them for the
   * support queue. A notification is sent to the support team as a side-effect.
   */
  @Public()
  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a contact-form enquiry from the PawMateHub web platform',
    description:
      'Stores the submission and emits a web.contact_submitted event. ' +
      'No authentication required — designed for the public marketing site.',
  })
  async submitContact(@Body() dto: CreateContactDto) {
    return this.supportService.submitContact(dto);
  }
}
