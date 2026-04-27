import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { VisionService } from './vision.service';
import { SafetyService } from './safety.service';
import {
  ApplyShopDto,
  UpdateShopProfileDto,
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
  ScanProductDto,
} from './shop.dto';

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly visionService: VisionService,
    private readonly safetyService: SafetyService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Asserts the user is the OWNER or MANAGER of the business that owns the shop.
   * Returns the BusinessProfile with its shopProfile.
   */
  async assertShopOwnerOrManager(userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        status: { not: 'REMOVED' },
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        business: {
          include: { shopProfile: true },
        },
      },
    });

    if (!member) {
      throw new ForbiddenException(
        'Only the business owner or manager can perform this action',
      );
    }

    return {
      member,
      business: member.business,
      shopProfile: member.business.shopProfile,
    };
  }

  /**
   * Asserts the user is any active team member of the business that owns the shop profile.
   */
  async assertShopTeamMember(userId: string, shopProfileId: string) {
    const shop = await this.prisma.shopProfile.findUnique({
      where: { id: shopProfileId },
      select: { businessProfileId: true },
    });
    if (!shop) {
      throw new NotFoundException('Shop profile not found');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: shop.businessProfileId,
          userId,
        },
      },
    });

    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException(
        'You are not an active team member of this shop',
      );
    }

    return member;
  }

  /**
   * Checks if a shop profile meets auto-approval criteria:
   * - At least one active product
   * - shopName is set
   * - categories has at least one entry
   */
  private async checkAutoApproval(shopProfileId: string): Promise<boolean> {
    const shop = await this.prisma.shopProfile.findUnique({
      where: { id: shopProfileId },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    if (!shop) return false;

    return !!(
      shop.shopName &&
      shop.categories.length >= 1 &&
      shop._count.products >= 1
    );
  }

  // ── Profile Management ─────────────────────────────────────────────────────

  async applyForShop(userId: string, dto: ApplyShopDto) {
    const { business } = await this.assertShopOwnerOrManager(userId);

    if (business.businessType !== 'SHOP') {
      throw new BadRequestException(
        'Business type must be SHOP to apply for a shop profile',
      );
    }

    // Check for existing shop profile
    const existing = await this.prisma.shopProfile.findUnique({
      where: { businessProfileId: business.id },
    });
    if (existing) {
      throw new ConflictException('This business already has a shop profile');
    }

    const shopProfile = await this.prisma.shopProfile.create({
      data: {
        businessProfileId: business.id,
        shopName: dto.shopName,
        tagline: dto.tagline,
        categories: (dto.categories ?? []) as any[],
        deliveryEnabled: dto.deliveryEnabled ?? true,
        deliveryRadiusKm: dto.deliveryRadiusKm ?? 10,
        deliveryCostEgp: dto.deliveryCostEgp ?? 25,
        freeDeliveryAboveEgp: dto.freeDeliveryAboveEgp,
        pickupEnabled: dto.pickupEnabled ?? true,
        status: 'PENDING_DOCS',
      },
    });

    this.events.emit('shop.applied', {
      shopProfileId: shopProfile.id,
      businessId: business.id,
      userId,
    });

    return shopProfile;
  }

  async updateProfile(userId: string, dto: UpdateShopProfileDto) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    // Build update data, excluding undefined values
    const updateData: any = {};
    const fields = [
      'shopName', 'tagline', 'deliveryEnabled', 'deliveryRadiusKm',
      'deliveryCostEgp', 'freeDeliveryAboveEgp', 'pickupEnabled',
    ];

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.categories !== undefined) {
      updateData.categories = dto.categories as any[];
    }

    const updated = await this.prisma.shopProfile.update({
      where: { id: shopProfile.id },
      data: updateData,
    });

    // Check auto-approval after update
    if (updated.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(updated.id);
      if (canApprove) {
        const approved = await this.prisma.shopProfile.update({
          where: { id: updated.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('shop.auto_approved', {
          shopProfileId: approved.id,
          userId,
        });
        return approved;
      }
    }

    return updated;
  }

  async getMyProfile(userId: string) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    return this.prisma.shopProfile.findUnique({
      where: { id: shopProfile.id },
      include: {
        products: { orderBy: { createdAt: 'desc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: { include: { product: true } } },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            photosUrls: true,
          },
        },
      },
    });
  }

  async getPublicProfile(id: string) {
    const profile = await this.prisma.shopProfile.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            photosUrls: true,
            averageRating: true,
            totalBookings: true,
            businessEmail: true,
            businessPhone: true,
          },
        },
      },
    });

    if (!profile || profile.status !== 'APPROVED') {
      throw new NotFoundException('Shop not found');
    }

    return profile;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async searchShops(filters: {
    city?: string;
    category?: string;
    query?: string;
    page: number;
  }) {
    const pageSize = 12;
    const skip = (filters.page - 1) * pageSize;

    const where: any = {
      status: 'APPROVED',
      businessProfile: {},
    };

    if (filters.city) {
      where.businessProfile.primaryCity = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters.category) {
      where.categories = { has: filters.category as any };
    }

    if (filters.query) {
      where.OR = [
        { shopName: { contains: filters.query, mode: 'insensitive' } },
        { tagline: { contains: filters.query, mode: 'insensitive' } },
        { businessProfile: { businessName: { contains: filters.query, mode: 'insensitive' } } },
      ];
    }

    const [shops, total] = await Promise.all([
      this.prisma.shopProfile.findMany({
        where,
        include: {
          businessProfile: {
            select: {
              businessName: true,
              primaryCity: true,
              primaryAddress: true,
              photosUrls: true,
              averageRating: true,
            },
          },
          _count: { select: { products: { where: { isActive: true } } } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shopProfile.count({ where }),
    ]);

    return {
      data: shops,
      total,
      page: filters.page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Product Management ────────────────────────────────────────────────────

  async createProduct(userId: string, dto: CreateProductDto) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    // Run safety scan on ingredients
    const safetyResult = this.safetyService.scanIngredients(dto.ingredientsList ?? null, []);

    const product = await this.prisma.shopProduct.create({
      data: {
        shopProfileId: shopProfile.id,
        name: dto.name,
        brand: dto.brand,
        category: dto.category as any,
        description: dto.description,
        weightGrams: dto.weightGrams,
        targetPetType: dto.targetPetType ?? [],
        targetAgeGroup: dto.targetAgeGroup ?? [],
        targetSizeGroup: dto.targetSizeGroup ?? [],
        ingredientsList: dto.ingredientsList,
        safetyFlags: safetyResult.flags,
        safetyFlaggedAt: safetyResult.flags.length > 0 ? new Date() : null,
        priceEgp: dto.priceEgp,
        comparePriceEgp: dto.comparePriceEgp,
        costEgp: dto.costEgp,
        stockCount: dto.stockCount ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        trackInventory: dto.trackInventory ?? true,
        photosUrls: dto.photosUrls ?? [],
        thumbnailUrl: dto.thumbnailUrl,
        isActive: dto.isActive ?? true,
      },
    });

    // Log safety flags if any
    if (safetyResult.flags.length > 0) {
      await this.safetyService.logSafetyFlags(product.id, safetyResult.flags, dto.ingredientsList ?? null);

      const hasCritical = safetyResult.details.some(d => d.severity === 'CRITICAL');
      const hasHigh = safetyResult.details.some(d => d.severity === 'HIGH');

      if (hasCritical) {
        this.events.emit('shop.product_safety_flag_critical', {
          shopProfileId: shopProfile.id,
          productId: product.id,
          flags: safetyResult.flags,
          details: safetyResult.details,
        });
      } else if (hasHigh) {
        this.events.emit('shop.product_safety_flag_high', {
          shopProfileId: shopProfile.id,
          productId: product.id,
          flags: safetyResult.flags,
          details: safetyResult.details,
        });
      }
    }

    // Check auto-approval after product creation
    if (shopProfile.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(shopProfile.id);
      if (canApprove) {
        await this.prisma.shopProfile.update({
          where: { id: shopProfile.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('shop.auto_approved', {
          shopProfileId: shopProfile.id,
          userId,
        });
      }
    }

    return {
      ...product,
      safetyDetails: safetyResult.details.length > 0 ? safetyResult.details : undefined,
    };
  }

  async updateProduct(userId: string, productId: string, dto: UpdateProductDto) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });
    if (!product || product.shopProfileId !== shopProfile.id) {
      throw new NotFoundException('Product not found in this shop');
    }

    // Build update data
    const updateData: any = {};
    const fields = [
      'name', 'brand', 'description', 'weightGrams',
      'targetPetType', 'targetAgeGroup', 'targetSizeGroup',
      'priceEgp', 'comparePriceEgp', 'costEgp',
      'stockCount', 'lowStockThreshold', 'trackInventory',
      'photosUrls', 'thumbnailUrl', 'isActive',
    ];

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.category !== undefined) {
      updateData.category = dto.category as any;
    }

    // Re-scan ingredients if changed
    if (dto.ingredientsList !== undefined) {
      updateData.ingredientsList = dto.ingredientsList;
      const safetyResult = this.safetyService.scanIngredients(dto.ingredientsList, []);
      updateData.safetyFlags = safetyResult.flags;
      if (safetyResult.flags.length > 0) {
        updateData.safetyFlaggedAt = new Date();
        await this.safetyService.logSafetyFlags(productId, safetyResult.flags, dto.ingredientsList);

        const hasCritical = safetyResult.details.some(d => d.severity === 'CRITICAL');
        const hasHigh = safetyResult.details.some(d => d.severity === 'HIGH');

        if (hasCritical) {
          this.events.emit('shop.product_safety_flag_critical', {
            shopProfileId: shopProfile.id,
            productId,
            flags: safetyResult.flags,
            details: safetyResult.details,
          });
        } else if (hasHigh) {
          this.events.emit('shop.product_safety_flag_high', {
            shopProfileId: shopProfile.id,
            productId,
            flags: safetyResult.flags,
            details: safetyResult.details,
          });
        }
      }
    }

    return this.prisma.shopProduct.update({
      where: { id: productId },
      data: updateData,
    });
  }

  async deleteProduct(userId: string, productId: string) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });
    if (!product || product.shopProfileId !== shopProfile.id) {
      throw new NotFoundException('Product not found in this shop');
    }

    // Soft delete — deactivate rather than removing
    return this.prisma.shopProduct.update({
      where: { id: productId },
      data: { isActive: false },
    });
  }

  async getProducts(shopProfileId: string, filters?: {
    category?: string;
    query?: string;
    activeOnly?: boolean;
  }) {
    const where: any = { shopProfileId };

    if (filters?.activeOnly !== false) {
      where.isActive = true;
    }

    if (filters?.category) {
      where.category = filters.category as any;
    }

    if (filters?.query) {
      where.OR = [
        { name: { contains: filters.query, mode: 'insensitive' } },
        { brand: { contains: filters.query, mode: 'insensitive' } },
        { description: { contains: filters.query, mode: 'insensitive' } },
      ];
    }

    return this.prisma.shopProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductDetail(productId: string) {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
      include: {
        shopProfile: {
          include: {
            businessProfile: {
              select: {
                businessName: true,
                primaryCity: true,
                primaryAddress: true,
              },
            },
          },
        },
      },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async getInventory(userId: string) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    const products = await this.prisma.shopProduct.findMany({
      where: { shopProfileId: shopProfile.id, isActive: true },
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        stockCount: true,
        lowStockThreshold: true,
        trackInventory: true,
        allowBackorder: true,
        priceEgp: true,
        costEgp: true,
      },
      orderBy: { stockCount: 'asc' },
    });

    const lowStock = products.filter(p => p.trackInventory && p.stockCount <= p.lowStockThreshold);
    const outOfStock = products.filter(p => p.trackInventory && p.stockCount === 0 && !p.allowBackorder);

    return {
      products,
      summary: {
        totalProducts: products.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      },
      lowStock,
      outOfStock,
    };
  }

  async adjustStock(userId: string, productId: string, dto: AdjustStockDto) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });
    if (!product || product.shopProfileId !== shopProfile.id) {
      throw new NotFoundException('Product not found in this shop');
    }

    const newStock = product.stockCount + dto.delta;
    if (newStock < 0) {
      throw new BadRequestException(
        `Cannot reduce stock below 0. Current: ${product.stockCount}, delta: ${dto.delta}`,
      );
    }

    return this.prisma.shopProduct.update({
      where: { id: productId },
      data: { stockCount: newStock },
    });
  }

  // ── Vision Scan ───────────────────────────────────────────────────────────

  async scanProduct(userId: string, dto: ScanProductDto) {
    // Verify the user has a shop profile
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    return this.visionService.scanProductImage(dto.imageUrl);
  }

  async scanAndCreateProduct(userId: string, dto: ScanProductDto) {
    const { shopProfile } = await this.assertShopOwnerOrManager(userId);
    if (!shopProfile) {
      throw new NotFoundException('Shop profile not found');
    }

    const scanResult = await this.visionService.scanProductImage(dto.imageUrl);
    const extracted = scanResult.extracted;

    // Run safety scan
    const safetyResult = this.safetyService.scanIngredients(
      extracted.ingredientsList,
      extracted.safetyFlags,
    );

    const product = await this.prisma.shopProduct.create({
      data: {
        shopProfileId: shopProfile.id,
        name: extracted.productName,
        brand: extracted.brand,
        category: (extracted.category as any) || 'OTHER',
        description: extracted.description,
        weightGrams: extracted.weightGrams,
        targetPetType: extracted.targetPetType ?? [],
        targetAgeGroup: extracted.targetAgeGroup ?? [],
        ingredientsList: extracted.ingredientsList,
        safetyFlags: safetyResult.flags,
        safetyFlaggedAt: safetyResult.flags.length > 0 ? new Date() : null,
        visionExtractedJson: scanResult.extracted as any,
        visionProcessedAt: new Date(scanResult.processedAt),
        visionModel: scanResult.model,
        priceEgp: extracted.suggestedPriceRangeEgp
          ? Math.round((extracted.suggestedPriceRangeEgp.min + extracted.suggestedPriceRangeEgp.max) / 2)
          : 100, // Default price to be updated by seller
        photosUrls: [dto.imageUrl],
        thumbnailUrl: dto.imageUrl,
        stockCount: 0,
        isActive: false, // Draft — seller must review and activate
      },
    });

    // Log safety flags
    if (safetyResult.flags.length > 0) {
      await this.safetyService.logSafetyFlags(product.id, safetyResult.flags, extracted.ingredientsList);

      const hasCritical = safetyResult.details.some(d => d.severity === 'CRITICAL');
      const hasHigh = safetyResult.details.some(d => d.severity === 'HIGH');

      if (hasCritical) {
        this.events.emit('shop.product_safety_flag_critical', {
          shopProfileId: shopProfile.id,
          productId: product.id,
          flags: safetyResult.flags,
          details: safetyResult.details,
        });
      } else if (hasHigh) {
        this.events.emit('shop.product_safety_flag_high', {
          shopProfileId: shopProfile.id,
          productId: product.id,
          flags: safetyResult.flags,
          details: safetyResult.details,
        });
      }
    }

    return {
      product,
      vision: scanResult,
      safetyDetails: safetyResult.details.length > 0 ? safetyResult.details : undefined,
    };
  }
}
