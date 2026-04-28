import {
  Controller,
  UseGuards,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  FlagReviewDto,
  SubmitReplyDto,
  ModerateReviewDto,
  ModerateReplyDto,
} from './reviews.dto';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ────────────────────────────────────────────
  // PUBLIC ENDPOINTS
  // ────────────────────────────────────────────

  @Public()
  @Get()
  @ApiQuery({ name: 'providerType', required: false })
  @ApiQuery({ name: 'providerProfileId', required: false })
  @ApiQuery({ name: 'providerUserId', required: false })
  @ApiQuery({ name: 'rating', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getReviews(
    @Query('providerType') providerType?: string,
    @Query('providerProfileId') providerProfileId?: string,
    @Query('providerUserId') providerUserId?: string,
    @Query('rating') rating?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewsService.getReviews({
      providerType,
      providerProfileId,
      providerUserId,
      rating: rating ? parseInt(rating, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Public()
  @Get('reputation/:providerType/:providerProfileId')
  getReputation(
    @Param('providerType') providerType: string,
    @Param('providerProfileId') providerProfileId: string,
  ) {
    return this.reviewsService.getReputationSnapshot(providerType, providerProfileId);
  }

  @Public()
  @Get(':id')
  getReviewById(@Param('id') id: string) {
    return this.reviewsService.getReviewById(id);
  }

  @Public()
  @Get('booking/:bookingId')
  getReviewByBookingId(@Param('bookingId') bookingId: string) {
    return this.reviewsService.getReviewByBookingId(bookingId);
  }

  // Legacy: get reviews for a specific sitter/petfriend
  @Public()
  @Get('sitter/:petFriendId')
  getSitterReviews(@Param('petFriendId') petFriendId: string) {
    return this.reviewsService.getReviewsForSitter(petFriendId);
  }

  // ────────────────────────────────────────────
  // AUTHENTICATED ENDPOINTS
  // ────────────────────────────────────────────

  @Post()
  createReview(@Request() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(req.user?.sub ?? req.user?.id, dto);
  }

  @Get('me/received')
  getMyReviews(@Request() req: any) {
    return this.reviewsService.getMyReviews(req.user?.sub ?? req.user?.id);
  }

  @Post(':id/flag')
  flagReview(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: FlagReviewDto,
  ) {
    return this.reviewsService.flagReview(id, req.user?.sub ?? req.user?.id, dto);
  }

  @Post(':id/helpful')
  markHelpful(@Param('id') id: string) {
    return this.reviewsService.markHelpful(id);
  }

  // ────────────────────────────────────────────
  // REPLY ENDPOINTS (Provider)
  // ────────────────────────────────────────────

  @Post(':id/reply')
  submitReply(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: SubmitReplyDto,
  ) {
    return this.reviewsService.submitReply(id, req.user?.sub ?? req.user?.id, dto);
  }

  // ────────────────────────────────────────────
  // ADMIN / MODERATION ENDPOINTS
  // ────────────────────────────────────────────

  @UseGuards(AdminGuard)
  @Patch(':id/moderate')
  moderateReview(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviewsService.moderateReview(id, req.user?.sub ?? req.user?.id, dto);
  }

  @UseGuards(AdminGuard)
  @Patch(':id/reply/approve')
  approveReply(@Param('id') id: string, @Request() req: any) {
    return this.reviewsService.approveReply(id, req.user?.sub ?? req.user?.id);
  }

  @UseGuards(AdminGuard)
  @Patch(':id/reply/reject')
  rejectReply(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: ModerateReplyDto,
  ) {
    return this.reviewsService.rejectReply(id, req.user?.sub ?? req.user?.id, dto);
  }
}
