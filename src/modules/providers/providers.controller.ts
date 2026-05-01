import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { OperatorService } from './operator.service';
import { CreateTeamInviteDto } from '../business/business.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(
    private providersService: ProvidersService,
    private operatorService: OperatorService,
  ) {}

  // ─── OPERATOR DASHBOARD ──────────────────────────────────────────────────
  // These routes must be declared BEFORE the generic @Get(':id') below —
  // Nest matches top-down and a generic :id param would otherwise capture
  // /providers/operator and /providers/invite as ids.

  @Get('operator/stats')
  @ApiOperation({ summary: 'Operator dashboard stats — bookings, earnings, team size, rating' })
  getOperatorStats(@Request() req: any) {
    return this.operatorService.getOperatorStats(req.user?.id);
  }

  @Get('operator/team')
  @ApiOperation({ summary: 'List team members linked to the calling operator' })
  getOperatorTeam(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('providerType') providerType?: string,
  ) {
    return this.operatorService.listTeam(req.user?.id, { status, providerType });
  }

  @Get('operator/team/:memberId')
  @ApiOperation({ summary: 'Single team member — profile + recent booking history' })
  getOperatorTeamMember(@Request() req: any, @Param('memberId') memberId: string) {
    return this.operatorService.getTeamMember(req.user?.id, memberId);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a new team member by email (operator only)' })
  inviteTeamMember(@Request() req: any, @Body() dto: CreateTeamInviteDto) {
    return this.operatorService.invite(req.user?.id, dto);
  }

  // ─── PROVIDER PROFILES ───────────────────────────────────────────────────

  @Post('profile')
  createProfile(@Request() req: any, @Body() body: any) {
    return this.providersService.createProfile(req.user?.id, body);
  }

  @Get('profile/me')
  getMyProfile(@Request() req: any) {
    return this.providersService.getMyProfile(req.user?.id);
  }

  @Patch('profile')
  updateProfile(@Request() req: any, @Body() body: any) {
    return this.providersService.updateProfile(req.user?.id, body);
  }

  // Note: removed @Public() — the role=operator-member branch needs an
  // authenticated user. Anonymous callers should use GET /search/sitters
  // (public) or POST /providers/search if a public discovery list is needed.
  @Get()
  listByType(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('role') role?: string,
  ) {
    // role=operator-member → web /operator/team page wants the operator's
    // own team. Same data as GET /providers/operator/team but expressed
    // as a query so the team page's existing TanStack Query key shape
    // (`["team", branch]`) works.
    if (role === 'operator-member') {
      return this.operatorService.listTeam(req.user?.id);
    }
    return this.providersService.listByType(type ?? '', city);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.providersService.getById(id);
  }

  // ─── PRODUCTS ────────────────────────────────────────────────────────────

  @Post('products')
  createProduct(@Request() req: any, @Body() body: any) {
    return this.providersService.createProduct(req.user?.id, body);
  }

  @Get('products/list')
  getProducts(
    @Query('sellerId') sellerId?: string,
    @Query('sellerType') sellerType?: string,
  ) {
    return this.providersService.getProducts({ sellerId, sellerType });
  }

  @Patch('products/:id')
  updateProduct(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.providersService.updateProduct(req.user?.id, id, body);
  }

  @Delete('products/:id')
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    return this.providersService.deleteProduct(req.user?.id, id);
  }

  // ─── ORDERS ──────────────────────────────────────────────────────────────

  @Post('orders')
  createOrder(@Request() req: any, @Body() body: any) {
    return this.providersService.createOrder(req.user?.id, body);
  }

  @Get('orders/mine')
  getMyOrders(@Request() req: any, @Query('role') role: 'buyer' | 'seller' = 'buyer') {
    return this.providersService.getMyOrders(req.user?.id, role);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.providersService.updateOrderStatus(req.user?.id, id, status);
  }
}
