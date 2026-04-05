import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const SELLER_COMMISSION = 0.85;

@Injectable()
export class FoodService {
  private readonly logger = new Logger(FoodService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================================
  // SELLERS
  // ============================================================

  async registerSeller(userId: string, data: {
    kitchenName: string;
    bio?: string;
    district?: string;
    profilePhoto?: string;
    availability: { days: string[]; note?: string };
  }) {
    const existing = await this.prisma.foodSeller.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException('You already have a food seller profile.');
    if (!data.kitchenName?.trim()) throw new BadRequestException('Kitchen name is required.');

    return this.prisma.foodSeller.create({
      data: {
        userId,
        kitchenName: data.kitchenName,
        bio: data.bio,
        district: data.district,
        profilePhoto: data.profilePhoto,
        availability: data.availability as any,
      } as any,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getMySellerProfile(userId: string) {
    const seller = await this.prisma.foodSeller.findUnique({
      where: { userId },
      include: {
        _count: { select: { products: true, ordersAsSeller: true } },
      },
    });
    if (!seller) throw new NotFoundException('No seller profile found. Register as a seller first.');
    return seller;
  }

  async updateMySellerProfile(userId: string, data: any) {
    const seller = await this.prisma.foodSeller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException('No seller profile found.');
    return this.prisma.foodSeller.update({
      where: { userId },
      data: data as any,
    });
  }

  async getSellerById(id: string) {
    const seller = await this.prisma.foodSeller.findFirst({
      where: { id, isActive: true },
      include: {
        user: { select: { id: true, firstName: true, profilePhoto: true } },
        products: {
          where: { isAvailable: true, deletedAt: null },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { products: true } },
      },
    });
    if (!seller) throw new NotFoundException('Seller not found.');
    return seller;
  }

  async listSellers(params: { district?: string; search?: string; page?: number }) {
    const page = params.page || 1;
    const limit = 20;
    const where: any = { isActive: true };
    if (params.district) where.district = { contains: params.district, mode: 'insensitive' };
    if (params.search) {
      where.OR = [
        { kitchenName: { contains: params.search, mode: 'insensitive' } },
        { bio: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodSeller.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, profilePhoto: true } } },
        orderBy: { avgRating: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.foodSeller.count({ where }),
    ]);
    return { items, meta: { page, limit, total } };
  }

  // ============================================================
  // PRODUCTS
  // ============================================================

  private async requireSeller(userId: string) {
    const seller = await this.prisma.foodSeller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException('You must register as a food seller first.');
    return seller;
  }

  async createProduct(userId: string, data: {
    name: string;
    targetAnimal: string;
    description: string;
    ingredients: string[];
    allergens?: string[];
    price: number;
    unitDesc: string;
    photos?: string[];
    stock?: number;
  }) {
    const seller = await this.requireSeller(userId);
    if (!data.photos || data.photos.length === 0) throw new BadRequestException('At least one photo is required.');
    if (data.price <= 0) throw new BadRequestException('Price must be positive.');

    return this.prisma.foodProduct.create({
      data: {
        sellerId: seller.id,
        name: data.name,
        targetAnimal: data.targetAnimal as any,
        description: data.description,
        ingredients: data.ingredients || [],
        allergens: data.allergens || [],
        price: data.price,
        unitDesc: data.unitDesc,
        photos: data.photos || [],
        stock: data.stock ?? 0,
        isAvailable: true,
      } as any,
    });
  }

  async listProducts(params: {
    targetAnimal?: string;
    allergenFree?: string;
    district?: string;
    search?: string;
    page?: number;
  }) {
    const page = params.page || 1;
    const limit = 24;
    const where: any = { isAvailable: true, deletedAt: null, seller: { isActive: true } };
    if (params.targetAnimal) where.targetAnimal = params.targetAnimal;
    if (params.district) where.seller = { ...where.seller, district: { contains: params.district, mode: 'insensitive' } };
    if (params.allergenFree) {
      // allergenFree=chicken means product has NO chicken allergen
      where.NOT = { allergens: { has: params.allergenFree } };
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
        { ingredients: { has: params.search } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.foodProduct.findMany({
        where,
        include: {
          seller: {
            select: { id: true, kitchenName: true, district: true, avgRating: true, profilePhoto: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.foodProduct.count({ where }),
    ]);
    return { items, meta: { page, limit, total } };
  }

  async getProductById(id: string) {
    const product = await this.prisma.foodProduct.findFirst({
      where: { id, deletedAt: null },
      include: {
        seller: {
          select: {
            id: true, kitchenName: true, district: true, bio: true,
            avgRating: true, totalReviews: true, totalSales: true,
            availability: true, profilePhoto: true,
            user: { select: { id: true, firstName: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  async getMyProducts(userId: string) {
    const seller = await this.requireSeller(userId);
    return this.prisma.foodProduct.findMany({
      where: { sellerId: seller.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProduct(userId: string, productId: string, data: any) {
    const seller = await this.requireSeller(userId);
    const product = await this.prisma.foodProduct.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== seller.id) throw new ForbiddenException('Not your product.');
    return this.prisma.foodProduct.update({ where: { id: productId }, data: data as any });
  }

  async deleteProduct(userId: string, productId: string) {
    const seller = await this.requireSeller(userId);
    const product = await this.prisma.foodProduct.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== seller.id) throw new ForbiddenException('Not your product.');
    await this.prisma.foodProduct.update({ where: { id: productId }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  // ============================================================
  // ORDERS
  // ============================================================

  async placeOrder(buyerId: string, data: {
    sellerId: string;
    items: { productId: string; quantity: number }[];
    pickupSlot: string;
    buyerNote?: string;
  }) {
    if (!data.items?.length) throw new BadRequestException('Order must have at least one item.');
    if (!data.pickupSlot?.trim()) throw new BadRequestException('Pickup slot is required.');

    const seller = await this.prisma.foodSeller.findFirst({ where: { id: data.sellerId, isActive: true } });
    if (!seller) throw new NotFoundException('Seller not found.');

    // Load and validate all products
    const productIds = data.items.map(i => i.productId);
    const products = await this.prisma.foodProduct.findMany({
      where: { id: { in: productIds }, sellerId: data.sellerId, isAvailable: true, deletedAt: null },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products are unavailable or do not belong to this seller.');
    }

    // Check stock
    for (const item of data.items) {
      const product = products.find(p => p.id === item.productId)!;
      if (item.quantity < 1) throw new BadRequestException(`Invalid quantity for ${product.name}.`);
      if (product.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for "${product.name}". Available: ${product.stock}.`);
      }
    }

    // Calculate totals
    let totalAmount = 0;
    const orderItems = data.items.map(item => {
      const product = products.find(p => p.id === item.productId)!;
      const subtotal = Number(product.price) * item.quantity;
      totalAmount += subtotal;
      return { productId: item.productId, quantity: item.quantity, unitPrice: Number(product.price), subtotal };
    });
    const sellerEarning = Math.round(totalAmount * SELLER_COMMISSION * 100) / 100;
    const platformFee = Math.round((totalAmount - sellerEarning) * 100) / 100;

    // Check buyer wallet
    const buyer = await this.prisma.user.findUnique({ where: { id: buyerId }, select: { walletBalance: true, firstName: true, lastName: true } });
    if (!buyer) throw new NotFoundException('Buyer not found.');
    if (Number(buyer.walletBalance) < totalAmount) {
      throw new BadRequestException(`Insufficient wallet balance. Need ${totalAmount} EGP, have ${buyer.walletBalance} EGP.`);
    }

    // Atomic: deduct wallet, create order + items, decrement stock
    const order = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: buyerId },
        data: { walletBalance: { decrement: totalAmount } } as any,
      });

      const created = await tx.foodOrder.create({
        data: {
          buyerId,
          sellerId: data.sellerId,
          totalAmount,
          sellerEarning,
          platformFee,
          pickupSlot: data.pickupSlot,
          buyerNote: data.buyerNote,
          status: 'placed',
          items: {
            create: orderItems.map(i => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
            })),
          },
        } as any,
        include: {
          items: { include: { product: { select: { id: true, name: true, photos: true } } } },
          seller: { select: { id: true, kitchenName: true, userId: true } },
        },
      });

      // Decrement stock
      for (const item of orderItems) {
        await tx.foodProduct.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } } as any,
        });
      }

      return created;
    });

    this.eventEmitter.emit('food.order_placed', {
      orderId: order.id,
      sellerUserId: (order.seller as any).userId,
      buyerName: `${buyer.firstName} ${buyer.lastName}`,
      totalAmount,
      pickupSlot: data.pickupSlot,
    });

    return order;
  }

  async getMyOrders(userId: string, role: 'buyer' | 'seller' = 'buyer') {
    if (role === 'seller') {
      const seller = await this.prisma.foodSeller.findUnique({ where: { userId } });
      if (!seller) return [];
      return this.prisma.foodOrder.findMany({
        where: { sellerId: seller.id },
        include: {
          buyer: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          items: { include: { product: { select: { id: true, name: true, photos: true, price: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.foodOrder.findMany({
      where: { buyerId: userId },
      include: {
        seller: { select: { id: true, kitchenName: true, profilePhoto: true, avgRating: true } },
        items: { include: { product: { select: { id: true, name: true, photos: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(userId: string, orderId: string) {
    const order = await this.prisma.foodOrder.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        seller: { select: { id: true, kitchenName: true, district: true, profilePhoto: true, userId: true, availability: true } },
        items: { include: { product: { select: { id: true, name: true, photos: true, price: true, unitDesc: true } } } },
        reviews: { select: { id: true, rating: true, text: true, targetType: true, reviewerId: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found.');

    const seller = order.seller as any;
    if (order.buyerId !== userId && seller.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }
    return order;
  }

  async confirmOrder(userId: string, orderId: string) {
    const order = await this.getOrderOrThrow(orderId);
    await this.assertSellerOwnsOrder(userId, order);
    if (order.status !== 'placed') throw new BadRequestException('Order is not in placed status.');

    const updated = await this.prisma.foodOrder.update({
      where: { id: orderId },
      data: { status: 'confirmed', confirmedAt: new Date() } as any,
    });

    this.eventEmitter.emit('food.order_confirmed', { orderId, buyerId: order.buyerId });
    return updated;
  }

  async rejectOrder(userId: string, orderId: string, reason: string) {
    const order = await this.getOrderOrThrow(orderId);
    await this.assertSellerOwnsOrder(userId, order);
    if (!['placed', 'confirmed'].includes(order.status as string)) {
      throw new BadRequestException('Cannot reject an order in this state.');
    }
    if (!reason?.trim()) throw new BadRequestException('Rejection reason is required.');

    await this.prisma.$transaction([
      this.prisma.foodOrder.update({
        where: { id: orderId },
        data: { status: 'rejected', rejectReason: reason } as any,
      }),
      // Refund buyer
      this.prisma.user.update({
        where: { id: order.buyerId },
        data: { walletBalance: { increment: Number(order.totalAmount) } } as any,
      }),
      // Restore stock
      ...await this.getStockRestoreOps(orderId),
    ]);

    this.eventEmitter.emit('food.order_rejected', {
      orderId, buyerId: order.buyerId, reason, totalAmount: Number(order.totalAmount),
    });
    return { success: true, refunded: Number(order.totalAmount) };
  }

  async markReadyForPickup(userId: string, orderId: string) {
    const order = await this.getOrderOrThrow(orderId);
    await this.assertSellerOwnsOrder(userId, order);
    if (order.status !== 'confirmed') throw new BadRequestException('Order must be confirmed first.');

    const updated = await this.prisma.foodOrder.update({
      where: { id: orderId },
      data: { status: 'ready_for_pickup', readyAt: new Date() } as any,
    });

    this.eventEmitter.emit('food.order_ready', { orderId, buyerId: order.buyerId });
    return updated;
  }

  async confirmPickup(userId: string, orderId: string) {
    const order = await this.getOrderOrThrow(orderId);
    if (order.buyerId !== userId) throw new ForbiddenException('Only the buyer can confirm pickup.');
    if (order.status !== 'ready_for_pickup') throw new BadRequestException('Order is not ready for pickup.');

    const sellerWithUser = await this.prisma.foodSeller.findUnique({
      where: { id: order.sellerId },
      select: { userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.foodOrder.update({
        where: { id: orderId },
        data: { status: 'picked_up', pickedUpAt: new Date() } as any,
      });
      // Release earnings to seller
      await tx.user.update({
        where: { id: sellerWithUser!.userId },
        data: { walletBalance: { increment: Number(order.sellerEarning) } } as any,
      });
      // Update seller stats
      await tx.foodSeller.update({
        where: { id: order.sellerId },
        data: { totalSales: { increment: 1 } } as any,
      });
    });

    this.eventEmitter.emit('food.order_picked_up', {
      orderId,
      sellerUserId: sellerWithUser!.userId,
      buyerId: order.buyerId,
      sellerEarning: Number(order.sellerEarning),
    });
    return { success: true };
  }

  // ============================================================
  // REVIEWS
  // ============================================================

  async submitReview(reviewerId: string, data: {
    orderId: string;
    targetType: 'product' | 'seller' | 'buyer';
    rating: number;
    text?: string;
    productId?: string;
    sellerId?: string;
    targetUserId?: string;
  }) {
    if (data.rating < 1 || data.rating > 5) throw new BadRequestException('Rating must be between 1 and 5.');
    const order = await this.prisma.foodOrder.findUnique({ where: { id: data.orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.status !== 'picked_up') throw new BadRequestException('Can only review after pickup is complete.');

    // Verify reviewer is either buyer or seller
    const seller = await this.prisma.foodSeller.findUnique({ where: { id: order.sellerId }, select: { userId: true } });
    const isBuyer = order.buyerId === reviewerId;
    const isSeller = seller?.userId === reviewerId;
    if (!isBuyer && !isSeller) throw new ForbiddenException('Access denied.');

    // Check for duplicate review of same type
    const existing = await this.prisma.foodReview.findFirst({
      where: { orderId: data.orderId, reviewerId, targetType: data.targetType },
    });
    if (existing) throw new BadRequestException('You already submitted this review.');

    const review = await this.prisma.foodReview.create({
      data: {
        orderId: data.orderId,
        reviewerId,
        targetType: data.targetType,
        rating: data.rating,
        text: data.text,
        productId: data.productId,
        sellerId: data.sellerId,
        targetUserId: data.targetUserId,
      } as any,
    });

    // Update averages
    if (data.targetType === 'product' && data.productId) {
      await this.recalcProductRating(data.productId);
    } else if (data.targetType === 'seller' && data.sellerId) {
      await this.recalcSellerRating(data.sellerId);
    }

    return review;
  }

  async getProductReviews(productId: string) {
    return this.prisma.foodReview.findMany({
      where: { productId, targetType: 'product' },
      include: { reviewer: { select: { id: true, firstName: true, profilePhoto: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  async getSellerDashboard(userId: string) {
    const seller = await this.requireSeller(userId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      monthlyEarnings,
      allTimeEarnings,
      completedOrders,
      pendingOrders,
      activeProducts,
    ] = await Promise.all([
      this.prisma.foodOrder.aggregate({
        where: { sellerId: seller.id, status: 'picked_up', pickedUpAt: { gte: startOfMonth } },
        _sum: { sellerEarning: true },
      }),
      this.prisma.foodOrder.aggregate({
        where: { sellerId: seller.id, status: 'picked_up' },
        _sum: { sellerEarning: true },
        _count: true,
      }),
      this.prisma.foodOrder.count({ where: { sellerId: seller.id, status: 'picked_up' } }),
      this.prisma.foodOrder.findMany({
        where: { sellerId: seller.id, status: { in: ['placed', 'confirmed'] } },
        include: {
          buyer: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          items: { include: { product: { select: { id: true, name: true, photos: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.foodProduct.findMany({
        where: { sellerId: seller.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      sellerId: seller.id,
      kitchenName: seller.kitchenName,
      avgRating: seller.avgRating,
      totalReviews: seller.totalReviews,
      totalSales: seller.totalSales,
      monthlyEarnings: Number((monthlyEarnings._sum as any).sellerEarning || 0),
      allTimeEarnings: Number((allTimeEarnings._sum as any).sellerEarning || 0),
      completedOrders,
      pendingOrders,
      activeProducts,
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private async getOrderOrThrow(orderId: string) {
    const order = await this.prisma.foodOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private async assertSellerOwnsOrder(userId: string, order: any) {
    const seller = await this.prisma.foodSeller.findUnique({ where: { userId } });
    if (!seller || seller.id !== order.sellerId) throw new ForbiddenException('Not your order.');
  }

  private async getStockRestoreOps(orderId: string) {
    const items = await this.prisma.foodOrderItem.findMany({ where: { orderId } });
    return items.map(item =>
      this.prisma.foodProduct.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } } as any,
      }),
    );
  }

  private async recalcProductRating(productId: string) {
    const agg = await this.prisma.foodReview.aggregate({
      where: { productId, targetType: 'product' },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.foodProduct.update({
      where: { id: productId },
      data: { avgRating: Number((agg._avg.rating || 0).toFixed(2)), totalReviews: agg._count } as any,
    });
  }

  private async recalcSellerRating(sellerId: string) {
    const agg = await this.prisma.foodReview.aggregate({
      where: { sellerId, targetType: 'seller' },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.foodSeller.update({
      where: { id: sellerId },
      data: { avgRating: Number((agg._avg.rating || 0).toFixed(2)), totalReviews: agg._count } as any,
    });
  }
}
