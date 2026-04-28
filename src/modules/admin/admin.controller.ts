import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Admin } from '../../common/decorators/admin.decorator';
import {
  GetProvidersQueryDto,
  GetParentsQueryDto,
  GetFinancialBreakdownQueryDto,
  BriefAgentDto,
} from './admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard overview stats' })
  getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('metrics/live')
  @ApiOperation({ summary: 'Real-time platform metrics snapshot (no caching)' })
  getLiveMetrics() {
    return this.adminService.getLiveMetrics();
  }

  @Get('providers')
  @ApiOperation({ summary: 'Paginated provider list with filters' })
  getProviders(@Query() query: GetProvidersQueryDto) {
    return this.adminService.getProviders(query);
  }

  @Get('parents')
  @ApiOperation({ summary: 'Paginated parent (pet owner) list with segments' })
  getParents(@Query() query: GetParentsQueryDto) {
    return this.adminService.getParents(query);
  }

  @Get('financials/breakdown')
  @ApiOperation({ summary: 'Financial breakdown by period' })
  getFinancialBreakdown(@Query() query: GetFinancialBreakdownQueryDto) {
    return this.adminService.getFinancialBreakdown(query);
  }

  @Post('agents/brief')
  @ApiOperation({ summary: 'Brief an AI agent with a task' })
  briefAgent(@Body() dto: BriefAgentDto) {
    return this.adminService.briefAgent(dto);
  }

  @Post('users/:id/ban')
  @ApiOperation({ summary: 'Ban a user' })
  banUser(@Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.banUser(id, reason);
  }

  @Post('users/:id/unban')
  @ApiOperation({ summary: 'Unban a user' })
  unbanUser(@Param('id') id: string) {
    return this.adminService.unbanUser(id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Soft-delete a user' })
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }
}
