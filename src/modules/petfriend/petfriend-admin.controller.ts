import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { Admin } from '../../common/decorators/admin.decorator';
import { PetFriendService } from './petfriend.service';
import { AdminReviewDto, SuspendDto } from './petfriend.dto';

@ApiTags('admin / petfriend')
@ApiBearerAuth()
@Admin()
@Controller('admin/petfriend')
export class PetFriendAdminController {
  constructor(private readonly petFriendService: PetFriendService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // GET /admin/petfriend/pending-review
  // ──────────────────────────────────────────────────────────────────────────
  @Get('pending-review')
  @ApiOperation({
    summary: 'List PetFriend profiles pending admin review',
    description:
      'Returns profiles with status=ADMIN_REVIEW ordered by application date (oldest first).',
  })
  listPendingReview() {
    return this.petFriendService.adminListPendingReview();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/petfriend/:id/review
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/review')
  @ApiOperation({
    summary: 'Approve or reject a PetFriend profile',
    description:
      'Set action to "approve" to activate the listing, or "reject" with a mandatory reason.',
  })
  @ApiParam({ name: 'id', description: 'PetFriendProfile UUID' })
  review(
    @Param('id') profileId: string,
    @Body() dto: AdminReviewDto,
    @Request() req: any,
  ) {
    return this.petFriendService.adminReview(
      profileId,
      dto.action,
      dto.reason,
      req.user.sub,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/petfriend/:id/suspend
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/suspend')
  @ApiOperation({
    summary: 'Suspend a PetFriend',
    description:
      'Sets status to SUSPENDED and deactivates the listing. Provide optional `until` date for temporary suspensions.',
  })
  @ApiParam({ name: 'id', description: 'PetFriendProfile UUID' })
  suspend(
    @Param('id') profileId: string,
    @Body() dto: SuspendDto,
    @Request() req: any,
  ) {
    return this.petFriendService.adminSuspend(
      profileId,
      dto.reason,
      dto.until ? new Date(dto.until) : undefined,
      req.user.sub,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // POST /admin/petfriend/:id/reinstate
  // ──────────────────────────────────────────────────────────────────────────
  @Post(':id/reinstate')
  @ApiOperation({
    summary: 'Reinstate a suspended PetFriend',
    description:
      'Restores a SUSPENDED profile to APPROVED status and reactivates the listing.',
  })
  @ApiParam({ name: 'id', description: 'PetFriendProfile UUID' })
  reinstate(@Param('id') profileId: string, @Request() req: any) {
    return this.petFriendService.adminReinstate(profileId, req.user.sub);
  }
}
