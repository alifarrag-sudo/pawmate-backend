import {
  Controller, Post, Get, Patch, Body, Param, Request, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offers')
export class OffersController {
  constructor(private offersService: OffersService) {}

  /** Owner creates a new price offer to a sitter */
  @Post()
  createOffer(@Request() req: any, @Body() body: {
    sitterId: string;
    service: string;
    ownerPrice: number;
    message?: string;
  }) {
    return this.offersService.createOffer(req.user.id, body);
  }

  /** Get my offers — pass ?role=owner (default) or ?role=sitter */
  @Get('mine')
  getMyOffers(@Request() req: any, @Query('role') role: 'owner' | 'sitter' = 'owner') {
    return this.offersService.getMyOffers(req.user.id, role);
  }

  /** Accept an offer */
  @Patch(':id/accept')
  acceptOffer(@Request() req: any, @Param('id') id: string) {
    return this.offersService.acceptOffer(req.user.id, id);
  }

  /** Decline an offer */
  @Patch(':id/decline')
  declineOffer(@Request() req: any, @Param('id') id: string) {
    return this.offersService.declineOffer(req.user.id, id);
  }

  /** Sitter sends a counter-offer */
  @Patch(':id/counter')
  counterOffer(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { counterPrice: number },
  ) {
    return this.offersService.counterOffer(req.user.id, id, body.counterPrice);
  }
}
