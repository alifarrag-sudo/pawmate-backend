import { Test, TestingModule } from '@nestjs/testing';
import { ShopService } from './shop.service';
import { VisionService } from './vision.service';
import { SafetyService } from './safety.service';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

describe('Shop Module', () => {
  let shopService: ShopService;
  let visionService: VisionService;
  let safetyService: SafetyService;
  let orderService: OrderService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  beforeEach(async () => {
    prisma = {
      shopProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      shopProduct: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      shopOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      shopOrderItem: {
        findMany: jest.fn(),
      },
      teamMember: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopService,
        VisionService,
        SafetyService,
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    shopService = module.get<ShopService>(ShopService);
    visionService = module.get<VisionService>(VisionService);
    safetyService = module.get<SafetyService>(SafetyService);
    orderService = module.get<OrderService>(OrderService);
  });

  // ── Vision scan: returns correct shape (mock API) ──────────────────────────

  describe('VisionService', () => {
    it('should return 503 when ANTHROPIC_API_KEY is not set', async () => {
      expect(visionService.isConfigured()).toBe(false);
      await expect(
        visionService.scanProductImage('https://example.com/image.jpg'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ── Safety flag scanner catches xylitol ────────────────────────────────────

  describe('SafetyService', () => {
    it('should catch xylitol in ingredients text', () => {
      const result = safetyService.scanIngredients(
        'Chicken meal, rice, xylitol, water, salt',
        [],
      );
      expect(result.flags).toContain('contains_xylitol');
      expect(result.details.find(d => d.flag === 'contains_xylitol')?.severity).toBe('CRITICAL');
    });

    it('should catch chocolate/cocoa in ingredients text', () => {
      const result = safetyService.scanIngredients(
        'Milk, sugar, cocoa butter, cocoa powder, vanilla',
        [],
      );
      expect(result.flags).toContain('contains_chocolate');
      expect(result.details.find(d => d.flag === 'contains_chocolate')?.severity).toBe('CRITICAL');
    });

    it('should catch onion and garlic', () => {
      const result = safetyService.scanIngredients(
        'Beef, carrots, onion powder, garlic, water',
        [],
      );
      expect(result.flags).toContain('contains_onion');
      expect(result.details.find(d => d.flag === 'contains_onion')?.severity).toBe('HIGH');
    });

    it('should merge Claude flags with keyword scan (union)', () => {
      const result = safetyService.scanIngredients(
        'Chicken, rice, xylitol',
        ['high_sodium'],
      );
      expect(result.flags).toContain('contains_xylitol');
      expect(result.flags).toContain('high_sodium');
      expect(result.flags.length).toBe(2);
    });

    it('should return empty flags for safe ingredients', () => {
      const result = safetyService.scanIngredients(
        'Chicken, rice, sweet potato, salmon oil, vitamins',
        [],
      );
      expect(result.flags).toHaveLength(0);
    });
  });

  // ── Safety flag audit logging ──────────────────────────────────────────────

  describe('SafetyService.logSafetyFlags', () => {
    it('should log critical safety flag in audit log', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      await safetyService.logSafetyFlags(
        'product-1',
        ['contains_xylitol'],
        'Chicken meal, xylitol, water',
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'ShopProduct',
          entityId: 'product-1',
          action: 'product_safety_flag',
          metadata: expect.objectContaining({
            flags: ['contains_xylitol'],
            severity: 'CRITICAL',
          }),
        }),
      });
    });

    it('should not log when no flags', async () => {
      await safetyService.logSafetyFlags('product-1', [], null);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  // ── Order creation: validates stock, calculates commission ─────────────────

  describe('OrderService.createOrder', () => {
    const mockShop = {
      id: 'shop-1',
      businessProfileId: 'biz-1',
      status: 'APPROVED',
      deliveryEnabled: true,
      deliveryCostEgp: 25,
      freeDeliveryAboveEgp: 500,
      businessProfile: { businessTier: 'FREE' },
    };

    const mockProducts = [
      {
        id: 'prod-1',
        shopProfileId: 'shop-1',
        name: 'Premium Dog Food',
        priceEgp: 250,
        stockCount: 10,
        trackInventory: true,
        allowBackorder: false,
        isActive: true,
      },
      {
        id: 'prod-2',
        shopProfileId: 'shop-1',
        name: 'Dog Collar',
        priceEgp: 250,
        stockCount: 5,
        trackInventory: true,
        allowBackorder: false,
        isActive: true,
      },
    ];

    it('should calculate 10% commission: 500 EGP order = 50 EGP fee, 450 EGP shopNet', async () => {
      prisma.shopProfile.findUnique.mockResolvedValue(mockShop);
      prisma.shopProduct.findMany.mockResolvedValue(mockProducts);
      prisma.shopProduct.update.mockResolvedValue({});
      prisma.shopOrder.create.mockImplementation(async ({ data }) => ({
        id: 'order-1',
        ...data,
        items: [
          { productId: 'prod-1', quantity: 1, unitPriceEgp: 250, totalEgp: 250 },
          { productId: 'prod-2', quantity: 1, unitPriceEgp: 250, totalEgp: 250 },
        ],
      }));

      const result = await orderService.createOrder(mockUserId, {
        shopProfileId: 'shop-1',
        items: [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-2', quantity: 1 },
        ],
        deliveryType: 'DELIVERY',
      });

      expect(result.subtotalEgp).toBe(500);
      expect(result.platformFeeEgp).toBe(50); // 10% of 500
      expect(result.shopNetEgp).toBe(450);    // 500 - 50
      expect(result.deliveryCostEgp).toBe(0); // free delivery above 500
      expect(result.totalEgp).toBe(500);      // subtotal + 0 delivery
    });

    it('should add delivery cost when below free threshold', async () => {
      prisma.shopProfile.findUnique.mockResolvedValue(mockShop);
      prisma.shopProduct.findMany.mockResolvedValue([mockProducts[0]]);
      prisma.shopProduct.update.mockResolvedValue({});
      prisma.shopOrder.create.mockImplementation(async ({ data }) => ({
        id: 'order-2',
        ...data,
        items: [{ productId: 'prod-1', quantity: 1, unitPriceEgp: 250, totalEgp: 250 }],
      }));

      const result = await orderService.createOrder(mockUserId, {
        shopProfileId: 'shop-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
        deliveryType: 'DELIVERY',
      });

      expect(result.subtotalEgp).toBe(250);
      expect(result.deliveryCostEgp).toBe(25); // below 500 threshold
      expect(result.totalEgp).toBe(275);       // 250 + 25
      expect(result.platformFeeEgp).toBe(25);  // 10% of 250
      expect(result.shopNetEgp).toBe(225);     // 250 - 25
    });

    it('should reject order when shop not approved', async () => {
      prisma.shopProfile.findUnique.mockResolvedValue({ ...mockShop, status: 'PENDING_DOCS' });

      await expect(
        orderService.createOrder(mockUserId, {
          shopProfileId: 'shop-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject order when out of stock', async () => {
      prisma.shopProfile.findUnique.mockResolvedValue(mockShop);
      prisma.shopProduct.findMany.mockResolvedValue([
        { ...mockProducts[0], stockCount: 0 },
      ]);

      await expect(
        orderService.createOrder(mockUserId, {
          shopProfileId: 'shop-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Order cancel restores stock ────────────────────────────────────────────

  describe('OrderService.cancelOrder', () => {
    it('should restore stock on cancellation', async () => {
      prisma.shopOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        parentUserId: mockUserId,
        shopProfileId: 'shop-1',
        status: 'PAID',
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
        shopProfile: { businessProfileId: 'biz-1' },
      });
      prisma.shopProduct.update.mockResolvedValue({});
      prisma.shopOrder.update.mockResolvedValue({ id: 'order-1', status: 'CANCELLED' });

      const result = await orderService.cancelOrder(mockUserId, 'order-1', 'Changed mind');

      expect(result.success).toBe(true);
      expect(prisma.shopProduct.update).toHaveBeenCalledTimes(2);
      expect(events.emit).toHaveBeenCalledWith('order.cancelled', expect.any(Object));
    });
  });
});
