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
import { TrainerService } from './trainer.service';
import { TrainerAdminReviewDto, TrainerSuspendDto } from './trainer.dto';

@ApiTags('admin / trainer')
@ApiBearerAuth()
@Admin()
@Controller('admin/trainer')
export class TrainerAdminController {
  constructor(private readonly trainerService: TrainerService) {}

  @Get('pending-review')
  @ApiOperation({ summary: 'List Trainer profiles pending admin review' })
  listPendingReview() {
    return this.trainerService.adminListPendingReview();
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Approve or reject a Trainer profile' })
  @ApiParam({ name: 'id', description: 'TrainerProfile ID' })
  review(
    @Param('id') profileId: string,
    @Body() dto: TrainerAdminReviewDto,
    @Request() req: any,
  ) {
    return this.trainerService.adminReview(
      profileId,
      dto.action,
      dto.reason,
      req.user.sub,
    );
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a Trainer' })
  @ApiParam({ name: 'id', description: 'TrainerProfile ID' })
  suspend(
    @Param('id') profileId: string,
    @Body() dto: TrainerSuspendDto,
    @Request() req: any,
  ) {
    return this.trainerService.adminSuspend(
      profileId,
      dto.reason,
      dto.until ? new Date(dto.until) : undefined,
      req.user.sub,
    );
  }

  @Post(':id/reinstate')
  @ApiOperation({ summary: 'Reinstate a suspended Trainer' })
  @ApiParam({ name: 'id', description: 'TrainerProfile ID' })
  reinstate(@Param('id') profileId: string, @Request() req: any) {
    return this.trainerService.adminReinstate(profileId, req.user.sub);
  }
}
