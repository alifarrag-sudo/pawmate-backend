import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './shop.dto';

const PRODUCT_COMMISSION_RATE = 0.10;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async createOrder(parentUserId: string, dto: CreateOrderDto) {
    const shop = await this.prisma.shopProfile.findUnique({
      where: { id: dto.shopProfileId },
      include: { businessProfile: true },
    });
    if (!shop || shop.status !== 'APPROVED') {
      throw new BadRequestException('Shop is not available');
    }

    // Validate products and stock
    const productIds = dto.items.map(i => i.productId);
    const products = await this.prisma.shopProduct.findMany({
      where: { id: { in: productIds }, shopProfileId: dto.shopProfileId, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products not found or inactive');
    }

    let subtotal = 0;
    const orderItems: Array<{ productId: string; quantity: number; unitPriceEgp: number; totalEgp: number }> = [];

    for (const item of dto.items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found`);

      if (product.trackInventory && product.stockCount < item.quantity && !product.allowBackorder) {
        throw new BadRequestException(`Insufficient stock for "${product.name}" (available: ${product.stockCount})`);
      }

      const itemTotal = product.priceEgp * item.quantity;
      subtotal += itemTotal;
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceEgp: product.priceEgp,
        totalEgp: itemTotal,
      });
    }

    const deliveryType = (dto.deliveryType as any) || 'DELIVERY';
    let deliveryCost = 0;
    if (deliveryType === 'DELIVERY' && shop.deliveryEnabled) {
      deliveryCost = shop.deliveryCostEgp;
      if (shop.freeDeliveryAboveEgp && subtotal >= shop.freeDeliveryAboveEgp) {
        deliveryCost = 0;
      }
    }

    const platformFee = Math.ceil(subtotal * PRODUCT_COMMISSION_RATE);
    const shopNet = subtotal - platformFee;
    const total = subtotal + deliveryCost;

    const order = await this.prisma.$transaction(async (tx) => {
      // Decrement stock
      for (const item of dto.items) {
        const product = products.find(p => p.id === item.productId)!;
        if (product.trackInventory) {
          await tx.shopProduct.update({
            where: { id: item.productId },
            data: { stockCount: { decrement: item.quantity } },
          });
        }
      }

      return tx.shopOrder.create({
        data: {
          shopProfileId: dto.shopProfileId,
          parentUserId,
          subtotalEgp: subtotal,
          deliveryCostEgp: deliveryCost,
          totalEgp: total,
          platformFeeEgp: platformFee,
          shopNetEgp: shopNet,
          deliveryType: deliveryType as any,
          deliveryAddress: dto.deliveryAddress,
          deliveryLat: dto.deliveryLat,
          deliveryLng: dto.deliveryLng,
          notes: dto.notes,
          status: 'PENDING_PAYMENT',
          items: {
            create: orderItems,
          },
        },
        include: { items: { include: { product: true } } },
      });
    });

    return order;
  }

  async confirmOrder(userId: string, orderId: string) {
    const order = await this.getOrderWithShopAuth(userId, orderId);
    if (order.status !== 'PAID') throw new BadRequestException('Order must be PAID to confirm');

    const updated = await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    this.events.emit('order.confirmed', { orderId, shopProfileId: order.shopProfileId });
    return updated;
  }

  async dispatchOrder(userId: string, orderId: string) {
    const order = await this.getOrderWithShopAuth(userId, orderId);
    if (order.status !== 'CONFIRMED' && order.status !== 'PREPARING') {
      throw new BadRequestException('Order must be CONFIRMED or PREPARING to dispatch');
    }

    const updated = await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
    });

    this.events.emit('order.dispatched', { orderId, parentUserId: order.parentUserId });
    return updated;
  }

  async deliverOrder(userId: string, orderId: string) {
    const order = await this.getOrderWithShopAuth(userId, orderId);
    if (order.status !== 'DISPATCHED') throw new BadRequestException('Order must be DISPATCHED to deliver');

    const updated = await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    this.events.emit('order.delivered', {
      orderId,
      shopProfileId: order.shopProfileId,
      shopNetEgp: order.shopNetEgp,
      platformFeeEgp: order.platformFeeEgp,
    });
    return updated;
  }

  async cancelOrder(userId: string, orderId: string, reason?: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { items: true, shopProfile: { include: { businessProfile: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const isParent = order.parentUserId === userId;
    const isShopOwner = await this.isShopTeamMember(userId, order.shopProfileId);

    if (!isParent && !isShopOwner) throw new ForbiddenException('Not authorized');

    const cancellableStatuses = ['PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled in current status');
    }

    // Restore stock
    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.shopProduct.update({
          where: { id: item.productId },
          data: { stockCount: { increment: item.quantity } },
        });
      }

      await tx.shopOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
    });

    this.events.emit('order.cancelled', { orderId, cancelledBy: userId, reason });
    return { success: true };
  }

  async getParentOrders(userId: string) {
    return this.prisma.shopOrder.findMany({
      where: { parentUserId: userId },
      include: {
        items: { include: { product: true } },
        shopProfile: {
          include: { businessProfile: { select: { businessName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShopOrders(userId: string, shopProfileId: string) {
    await this.assertShopTeamMember(userId, shopProfileId);

    return this.prisma.shopOrder.findMany({
      where: { shopProfileId },
      include: {
        items: { include: { product: true } },
        parentUser: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(userId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        shopProfile: {
          include: { businessProfile: { select: { businessName: true, businessPhone: true } } },
        },
        parentUser: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const isParent = order.parentUserId === userId;
    const isShopOwner = await this.isShopTeamMember(userId, order.shopProfileId);
    if (!isParent && !isShopOwner) throw new ForbiddenException('Not authorized');

    return order;
  }

  private async getOrderWithShopAuth(userId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    await this.assertShopTeamMember(userId, order.shopProfileId);

    return order;
  }

  private async assertShopTeamMember(userId: string, shopProfileId: string): Promise<void> {
    const isMember = await this.isShopTeamMember(userId, shopProfileId);
    if (!isMember) throw new ForbiddenException('Not authorized');
  }

  private async isShopTeamMember(userId: string, shopProfileId: string): Promise<boolean> {
    const shop = await this.prisma.shopProfile.findUnique({
      where: { id: shopProfileId },
      select: { businessProfileId: true },
    });
    if (!shop) return false;

    const member = await this.prisma.teamMember.findUnique({
      where: { businessId_userId: { businessId: shop.businessProfileId, userId } },
    });
    return !!(member && member.status !== 'REMOVED');
  }
}
