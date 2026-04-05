import { Controller, UseGuards, Get, Post, Param, Body, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post()
  submitReview(
    @Request() req: any,
    @Body()
    body: {
      bookingId: string;
      sitterId: string;
      rating: number;
      comment?: string;
      serviceType?: string;
    },
  ) {
    return this.reviewsService.submitReview(req.user?.id, body);
  }

  @Get('me')
  getMyReviews(@Request() req: any) {
    return this.reviewsService.getMyReviews(req.user?.id);
  }

  @Get('sitter/:sitterId')
  getSitterReviews(@Param('sitterId') sitterId: string) {
    return this.reviewsService.getReviewsForSitter(sitterId);
  }
}
