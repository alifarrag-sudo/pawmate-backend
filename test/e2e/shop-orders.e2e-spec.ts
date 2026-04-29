/**
 * Suite 7 -- Shop Order Flow
 *
 * Tests the OrderService at the service level with mocked Prisma.
 * Verifies stock validation, out-of-stock rejection, and commission
 * calculation on shop orders.
 */

import { BadRequestException } from '@nestjs/common';
import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { OrderService } from '../../src/modules/shop/order.service';
import { createUser } from '../factories/user.factory';

// ── Helpers ────────────────────────────────────────────────────────────────

function createShopProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'shop-profile-1',
    businessProfileId: 'biz-1',
    shopName: 'PawMate Pet Store',
    status: 'APPROVED',
    deliveryEnabled: true,
    deliveryCostEgp: 25,
    freeDeliveryAboveEgp: 200,
    pickupEnabled: true,
    businessProfile: {
      id: 'biz-1',
      businessName: 'PawMate Pet Store LLC',
    },
    ...overrides,
  };
}

function createProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'product-1',
    shopProfileId: 'shop-profile-1',
    name: 'Premium Dog Food',
    priceEgp: 250,
    stockCount: 5,
    trackInventory: true,
    allowBackorder: false,
    isActive: true,
    ...overrides,
  };
}

function createTeamMember(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    businessId: 'biz-1',
    userId: 'shop-owner-1',
    role: 'OWNER',
    status: 'ACTIVE',
    ...overrides,
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('Shop Order Flow', () => {
  let ctx: TestContext;
  let orderService: OrderService;

  const parentUser = createUser({ id: 'parent-1' });

  beforeEach(async () => {
    ctx = await buildTestModule([OrderService]);
    orderService = ctx.module.get(OrderService);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 1: Order creation with stock validation
  // ──────────────────────────────────────────────────────────────────────

  it('should create order and decrement stock', async () => {
    const shop = createShopProfile();
    const product = createProduct({ stockCount: 5 });

    ctx.prisma.shopProfile.findUnique.mockResolvedValue(shop);
    ctx.prisma.shopProduct.findMany.mockResolvedValue([product]);

    // Wire $transaction to execute the callback with a mock tx
    const mockTx = {
      shopProduct: { update: jest.fn().mockResolvedValue({ ...product, stockCount: 3 }) },
      shopOrder: {
        create: jest.fn().mockResolvedValue({
          id: 'order-1',
          shopProfileId: shop.id,
          parentUserId: parentUser.id,
          subtotalEgp: 500,
          deliveryCostEgp: 25,
          totalEgp: 525,
          platformFeeEgp: 50,
          shopNetEgp: 450,
          status: 'PENDING_PAYMENT',
          items: [
            {
              productId: product.id,
              quantity: 2,
              unitPriceEgp: 250,
              totalEgp: 500,
              product,
            },
          ],
        }),
      },
    };
    ctx.prisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    const order = await orderService.createOrder(parentUser.id, {
      shopProfileId: shop.id,
      items: [{ productId: product.id, quantity: 2 }],
    });

    expect(order).toBeDefined();
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.subtotalEgp).toBe(500);

    // Stock decrement was called
    expect(mockTx.shopProduct.update).toHaveBeenCalledWith({
      where: { id: product.id },
      data: { stockCount: { decrement: 2 } },
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 2: Order rejected if out of stock
  // ──────────────────────────────────────────────────────────────────────

  it('should reject order when requested quantity exceeds stock', async () => {
    const shop = createShopProfile();
    const product = createProduct({ stockCount: 1 });

    ctx.prisma.shopProfile.findUnique.mockResolvedValue(shop);
    ctx.prisma.shopProduct.findMany.mockResolvedValue([product]);

    await expect(
      orderService.createOrder(parentUser.id, {
        shopProfileId: shop.id,
        items: [{ productId: product.id, quantity: 2 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 3: Commission calculation on shop order
  // ──────────────────────────────────────────────────────────────────────

  it('should calculate 10% platform fee and correct shopNet', async () => {
    const shop = createShopProfile({ deliveryEnabled: false });
    const product = createProduct({ stockCount: 10, priceEgp: 500 });

    ctx.prisma.shopProfile.findUnique.mockResolvedValue(shop);
    ctx.prisma.shopProduct.findMany.mockResolvedValue([product]);

    // subtotal = 500 * 1 = 500
    // platformFee = ceil(500 * 0.10) = 50
    // shopNet = 500 - 50 = 450
    const mockTx = {
      shopProduct: { update: jest.fn().mockResolvedValue({ ...product, stockCount: 9 }) },
      shopOrder: {
        create: jest.fn().mockImplementation(async (args: any) => ({
          id: 'order-commission-1',
          ...args.data,
          items: args.data.items.create,
        })),
      },
    };
    ctx.prisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

    const order = await orderService.createOrder(parentUser.id, {
      shopProfileId: shop.id,
      items: [{ productId: product.id, quantity: 1 }],
      deliveryType: 'PICKUP',
    });

    expect(order.platformFeeEgp).toBe(50);
    expect(order.shopNetEgp).toBe(450);
    expect(order.subtotalEgp).toBe(500);
  });
});
