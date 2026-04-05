import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FoodService } from './food.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('food')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('food')
export class FoodController {
  constructor(private foodService: FoodService) {}

  // ── Sellers ──────────────────────────────────────────────────

  @Post('sellers/register')
  registerSeller(@Request() req: any, @Body() body: any) {
    return this.foodService.registerSeller(req.user?.id, body);
  }

  @Get('sellers/me')
  getMySellerProfile(@Request() req: any) {
    return this.foodService.getMySellerProfile(req.user?.id);
  }

  @Patch('sellers/me')
  updateMySellerProfile(@Request() req: any, @Body() body: any) {
    return this.foodService.updateMySellerProfile(req.user?.id, body);
  }

  @Get('sellers')
  listSellers(
    @Query('district') district?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.foodService.listSellers({ district, search, page: page ? +page : 1 });
  }

  @Get('sellers/:id')
  getSellerById(@Param('id') id: string) {
    return this.foodService.getSellerById(id);
  }

  // ── Products ──────────────────────────────────────────────────

  @Post('products')
  createProduct(@Request() req: any, @Body() body: any) {
    return this.foodService.createProduct(req.user?.id, body);
  }

  @Get('products')
  listProducts(
    @Query('targetAnimal') targetAnimal?: string,
    @Query('allergenFree') allergenFree?: string,
    @Query('district') district?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.foodService.listProducts({ targetAnimal, allergenFree, district, search, page: page ? +page : 1 });
  }

  @Get('products/mine')
  getMyProducts(@Request() req: any) {
    return this.foodService.getMyProducts(req.user?.id);
  }

  @Get('products/:id')
  getProductById(@Param('id') id: string) {
    return this.foodService.getProductById(id);
  }

  @Get('products/:id/reviews')
  getProductReviews(@Param('id') id: string) {
    return this.foodService.getProductReviews(id);
  }

  @Patch('products/:id')
  updateProduct(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.foodService.updateProduct(req.user?.id, id, body);
  }

  @Delete('products/:id')
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    return this.foodService.deleteProduct(req.user?.id, id);
  }

  // ── Orders ────────────────────────────────────────────────────

  @Post('orders')
  placeOrder(@Request() req: any, @Body() body: any) {
    return this.foodService.placeOrder(req.user?.id, body);
  }

  @Get('orders')
  getMyOrders(@Request() req: any, @Query('role') role?: 'buyer' | 'seller') {
    return this.foodService.getMyOrders(req.user?.id, role || 'buyer');
  }

  @Get('orders/:id')
  getOrderById(@Request() req: any, @Param('id') id: string) {
    return this.foodService.getOrderById(req.user?.id, id);
  }

  @Patch('orders/:id/confirm')
  confirmOrder(@Request() req: any, @Param('id') id: string) {
    return this.foodService.confirmOrder(req.user?.id, id);
  }

  @Patch('orders/:id/reject')
  rejectOrder(@Request() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.foodService.rejectOrder(req.user?.id, id, reason);
  }

  @Patch('orders/:id/ready')
  markReadyForPickup(@Request() req: any, @Param('id') id: string) {
    return this.foodService.markReadyForPickup(req.user?.id, id);
  }

  @Patch('orders/:id/pickup')
  confirmPickup(@Request() req: any, @Param('id') id: string) {
    return this.foodService.confirmPickup(req.user?.id, id);
  }

  // ── Reviews ───────────────────────────────────────────────────

  @Post('reviews')
  submitReview(@Request() req: any, @Body() body: any) {
    return this.foodService.submitReview(req.user?.id, body);
  }

  // ── Seller Dashboard ──────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return this.foodService.getSellerDashboard(req.user?.id);
  }
}
