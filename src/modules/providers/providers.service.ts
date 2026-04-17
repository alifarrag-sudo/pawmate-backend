import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const PLATFORM_FEE_RATE = 0.15;

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  // ─── PROVIDER PROFILES ──────────────────────────────────────────────────

  private normalizeProviderInput(data: any) {
    const mapped: any = { ...data };
    // Mobile sends 'type' but schema field is 'providerType'
    if ('type' in mapped && !('providerType' in mapped)) {
      mapped.providerType = mapped.type;
    }
    delete mapped.type;
    // Mobile may send 'district' — store as city (ProviderProfile has no district field)
    if ('district' in mapped && !('city' in mapped)) {
      mapped.city = mapped.district;
    }
    delete mapped.district;
    return mapped;
  }

  async createProfile(userId: string, data: any) {
    const existing = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('You already have a provider profile.');

    return this.prisma.providerProfile.create({
      data: { ...this.normalizeProviderInput(data), userId },
    });
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId },
      include: { products: { where: { isAvailable: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!profile) throw new NotFoundException('Provider profile not found.');
    return profile;
  }

  async updateProfile(userId: string, data: any) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Provider profile not found.');
    return this.prisma.providerProfile.update({ where: { userId }, data: this.normalizeProviderInput(data) });
  }

  async getById(id: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true, phone: true } },
        products: { where: { isAvailable: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!profile) throw new NotFoundException('Provider not found.');
    return profile;
  }

  async listByType(providerType: string, city?: string) {
    return this.prisma.providerProfile.findMany({
      where: {
        providerType: providerType as any,
        isActive: true,
        ...(city ? { city: { contains: city, mode: 'insensitive' as any } } : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true, profilePhoto: true } },
      },
      orderBy: [{ isVerified: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // ─── PRODUCTS ────────────────────────────────────────────────────────────

  async createProduct(userId: string, data: any) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('You need a provider profile first.');

    return this.prisma.product.create({
      data: {
        ...data,
        sellerId: userId,
        providerProfileId: profile.id,
        sellerType: profile.providerType,
      },
    });
  }

  async getProducts(params: { sellerId?: string; sellerType?: string }) {
    return this.prisma.product.findMany({
      where: {
        isAvailable: true,
        ...(params.sellerId ? { sellerId: params.sellerId } : {}),
        ...(params.sellerType ? { sellerType: params.sellerType as any } : {}),
      },
      include: {
        seller: { select: { firstName: true, lastName: true, profilePhoto: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProduct(userId: string, productId: string, data: any) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== userId) throw new ForbiddenException('Not your product.');
    return this.prisma.product.update({ where: { id: productId }, data });
  }

  async deleteProduct(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    if (product.sellerId !== userId) throw new ForbiddenException('Not your product.');
    return this.prisma.product.delete({ where: { id: productId } });
  }

  // ─── ORDERS ──────────────────────────────────────────────────────────────

  async createOrder(buyerId: string, data: {
    sellerId: string;
    items: { productId: string; quantity: number }[];
    deliveryType: string;
    deliveryAddress?: string;
    notes?: string;
  }) {
    if (buyerId === data.sellerId) throw new BadRequestException('You cannot order from yourself.');

    // Validate and calculate totals
    const productIds = data.items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, sellerId: data.sellerId, isAvailable: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products are not available.');
    }

    const productMap = new Map(products.map(p => [p.id, p]));
    let totalAmount = 0;

    const orderItems = data.items.map(item => {
      const product = productMap.get(item.productId)!;
      const lineTotal = Number(product.price) * item.quantity;
      totalAmount += lineTotal;
      return { productId: item.productId, quantity: item.quantity, unitPrice: Number(product.price) };
    });

    const platformFee = Math.round(totalAmount * PLATFORM_FEE_RATE * 100) / 100;
    const sellerEarning = totalAmount - platformFee;

    return this.prisma.order.create({
      data: {
        buyer: { connect: { id: buyerId } },
        seller: { connect: { id: data.sellerId } },
        totalAmount,
        platformFee,
        sellerEarning,
        status: 'pending',
        deliveryType: data.deliveryType as any,
        deliveryAddress: data.deliveryAddress,
        notes: data.notes,
        items: {
          create: orderItems.map(item => ({
            product: { connect: { id: item.productId } },
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });
  }

  async getMyOrders(userId: string, role: 'buyer' | 'seller') {
    const where = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    return this.prisma.order.findMany({
      where,
      include: {
        buyer: { select: { firstName: true, lastName: true } },
        seller: { select: { firstName: true, lastName: true } },
        items: { include: { product: { select: { name: true, photos: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateOrderStatus(userId: string, orderId: string, status: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException('Not your order.');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: status as any },
    });
  }
}
