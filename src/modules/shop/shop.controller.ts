import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Param,
  Body,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ShopService } from './shop.service';
import { OrderService } from './order.service';
import {
  ApplyShopDto,
  UpdateShopProfileDto,
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
  CreateOrderDto,
  ScanProductDto,
} from './shop.dto';

@ApiTags('shop')
@Controller('shop')
export class ShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly orderService: OrderService,
  ) {}

  // ── Profile ─────────────────────────────────────────────────────────────────

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a shop profile (requires SHOP business)' })
  apply(@Request() req: any, @Body() dto: ApplyShopDto) {
    return this.shopService.applyForShop(req.user.id, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update shop profile fields' })
  updateProfile(@Request() req: any, @Body() dto: UpdateShopProfileDto) {
    return this.shopService.updateProfile(req.user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user shop profile (operator view)' })
  getMyProfile(@Request() req: any) {
    return this.shopService.getMyProfile(req.user.id);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Get shop public profile' })
  @ApiParam({ name: 'id', description: 'Shop profile ID' })
  getPublicProfile(@Param('id') id: string) {
    return this.shopService.getPublicProfile(id);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Search shops' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false })
  searchShops(
    @Query('city') city?: string,
    @Query('category') category?: string,
    @Query('q') query?: string,
    @Query('page') page?: string,
  ) {
    return this.shopService.searchShops({
      city,
      category,
      query,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // ── Products ────────────────────────────────────────────────────────────────

  @Post('products')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product listing' })
  createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    return this.shopService.createProduct(req.user.id, dto);
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product listing' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  updateProduct(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.shopService.updateProduct(req.user.id, id, dto);
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete (deactivate) a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    return this.shopService.deleteProduct(req.user.id, id);
  }

  @Get('products/shop/:shopId')
  @ApiOperation({ summary: 'Get products for a shop (public)' })
  @ApiParam({ name: 'shopId', description: 'Shop profile ID' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'q', required: false })
  getProducts(
    @Param('shopId') shopId: string,
    @Query('category') category?: string,
    @Query('q') query?: string,
  ) {
    return this.shopService.getProducts(shopId, { category, query, activeOnly: true });
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product detail (public)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  getProductDetail(@Param('id') id: string) {
    return this.shopService.getProductDetail(id);
  }

  // ── Inventory ───────────────────────────────────────────────────────────────

  @Get('inventory')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get inventory overview (operator)' })
  getInventory(@Request() req: any) {
    return this.shopService.getInventory(req.user.id);
  }

  @Patch('products/:id/stock')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjust product stock' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  adjustStock(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.shopService.adjustStock(req.user.id, id, dto);
  }

  // ── Vision Scan ─────────────────────────────────────────────────────────────

  @Post('products/scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Scan product image with AI vision (preview only)' })
  scanProduct(@Request() req: any, @Body() dto: ScanProductDto) {
    return this.shopService.scanProduct(req.user.id, dto);
  }

  @Post('products/scan-and-create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Scan product image and create draft listing' })
  scanAndCreateProduct(@Request() req: any, @Body() dto: ScanProductDto) {
    return this.shopService.scanAndCreateProduct(req.user.id, dto);
  }

  // ── Orders (Parent) ────────────────────────────────────────────────────────

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new order (parent)' })
  createOrder(@Request() req: any, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(req.user.id, dto);
  }

  @Get('orders/my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my orders as parent' })
  getMyOrders(@Request() req: any) {
    return this.orderService.getParentOrders(req.user.id);
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get order detail (parent or shop owner)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  getOrderById(@Request() req: any, @Param('id') id: string) {
    return this.orderService.getOrderById(req.user.id, id);
  }

  // ── Orders (Operator) ──────────────────────────────────────────────────────

  @Get('orders/shop/:shopId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get orders for a shop (operator)' })
  @ApiParam({ name: 'shopId', description: 'Shop profile ID' })
  getShopOrders(@Request() req: any, @Param('shopId') shopId: string) {
    return this.orderService.getShopOrders(req.user.id, shopId);
  }

  @Post('orders/:id/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm an order (operator)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  confirmOrder(@Request() req: any, @Param('id') id: string) {
    return this.orderService.confirmOrder(req.user.id, id);
  }

  @Post('orders/:id/dispatch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark order as dispatched (operator)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  dispatchOrder(@Request() req: any, @Param('id') id: string) {
    return this.orderService.dispatchOrder(req.user.id, id);
  }

  @Post('orders/:id/deliver')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark order as delivered (operator)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  deliverOrder(@Request() req: any, @Param('id') id: string) {
    return this.orderService.deliverOrder(req.user.id, id);
  }

  @Post('orders/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel an order (parent or operator)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  cancelOrder(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.orderService.cancelOrder(req.user.id, id, body.reason);
  }
}
