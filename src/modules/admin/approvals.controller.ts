import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { Admin } from '../../common/decorators/admin.decorator';
import {
  CreateApprovalDto,
  GetApprovalsQueryDto,
  ResolveApprovalDto,
} from './dto/approvals.dto';

/**
 * /admin/approvals — agent-action proposals awaiting human sign-off.
 *
 * Routes are gated by @Admin() (JwtAuthGuard + AdminGuard) so only
 * admin / owner / owner_restricted can read or resolve. POST creation
 * is the same gate today; if AI agents need to submit without a JWT in
 * the future, that's a separate webhook auth path.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/approvals')
export class AdminApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List approvals — filter by status / agent / routing.' })
  list(@Query() query: GetApprovalsQueryDto) {
    return this.approvals.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single approval with full payload.' })
  getOne(@Param('id') id: string) {
    return this.approvals.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an approval proposal (agent or admin).' })
  create(@Body() dto: CreateApprovalDto) {
    return this.approvals.create(dto);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Approve or reject (owner / owner_restricted).' })
  resolve(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ResolveApprovalDto,
  ) {
    return this.approvals.resolve(id, dto, {
      id: req.user?.id,
      roles: req.user?.roles ?? [],
    });
  }
}
