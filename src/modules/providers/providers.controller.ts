import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

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

  @Public()
  @Get()
  listByType(@Query('type') type: string, @Query('city') city?: string) {
    return this.providersService.listByType(type, city);
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
