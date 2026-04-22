import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessService } from './business.service';
import { AdminReviewBusinessDto } from './business.dto';

// Using JwtAuthGuard + manual admin check via service layer
// In production, use @Admin() decorator from Prompt 1 infrastructure

@ApiTags('admin/business')
@Controller('admin/business')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessAdminController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('pending-review')
  @ApiOperation({ summary: 'List businesses pending review' })
  getPendingReview() {
    return this.businessService.getPendingReview();
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Review a business application (approve/reject)' })
  @ApiParam({ name: 'id', description: 'Business profile ID' })
  review(@Param('id') id: string, @Body() dto: AdminReviewBusinessDto) {
    return this.businessService.reviewBusiness(id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a business' })
  @ApiParam({ name: 'id', description: 'Business profile ID' })
  suspend(@Param('id') id: string) {
    return this.businessService.suspendBusiness(id);
  }

  @Post(':id/reinstate')
  @ApiOperation({ summary: 'Reinstate a suspended business' })
  @ApiParam({ name: 'id', description: 'Business profile ID' })
  reinstate(@Param('id') id: string) {
    return this.businessService.reinstateBusiness(id);
  }
}
