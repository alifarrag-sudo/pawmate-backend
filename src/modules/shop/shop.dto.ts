import {
  IsOptional, IsString, IsNumber, IsArray, IsBoolean, IsInt,
  Min, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Apply Shop ──────────────────────────────────────────────────────────────

export class ApplyShopDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shopName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of ShopCategory values' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  deliveryCostEgp?: number;

  @ApiPropertyOptional({ description: 'Free delivery if order exceeds this amount' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  freeDeliveryAboveEgp?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;
}

// ─── Update Shop Profile ────────────────────────────────────────────────────

export class UpdateShopProfileDto extends ApplyShopDto {}

// ─── Create Product ──────────────────────────────────────────────────────────

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({
    enum: ['PET_FOOD', 'TREATS_SNACKS', 'ACCESSORIES', 'GROOMING_PRODUCTS', 'HEALTH_MEDICINE', 'TOYS', 'BEDDING', 'TRAINING_AIDS', 'CLOTHING', 'OTHER'],
  })
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  weightGrams?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPetType?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetAgeGroup?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSizeGroup?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ingredientsList?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  priceEgp: number;

  @ApiPropertyOptional({ description: 'Compare-at (strikethrough) price' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  comparePriceEgp?: number;

  @ApiPropertyOptional({ description: 'Cost price for margin calculation' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  costEgp?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stockCount?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Update Product ──────────────────────────────────────────────────────────

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    enum: ['PET_FOOD', 'TREATS_SNACKS', 'ACCESSORIES', 'GROOMING_PRODUCTS', 'HEALTH_MEDICINE', 'TOYS', 'BEDDING', 'TRAINING_AIDS', 'CLOTHING', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  weightGrams?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetPetType?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetAgeGroup?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSizeGroup?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ingredientsList?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  priceEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  comparePriceEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  costEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stockCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Adjust Stock ────────────────────────────────────────────────────────────

export class AdjustStockDto {
  @ApiProperty({ description: 'Positive to add, negative to subtract' })
  @IsInt()
  @Type(() => Number)
  delta: number;
}

// ─── Order Item ──────────────────────────────────────────────────────────────

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

// ─── Create Order ────────────────────────────────────────────────────────────

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  shopProfileId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ enum: ['DELIVERY', 'PICKUP'] })
  @IsOptional()
  @IsString()
  deliveryType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deliveryLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  deliveryLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Scan Product ────────────────────────────────────────────────────────────

export class ScanProductDto {
  @ApiProperty({ description: 'Cloudinary URL of the product image' })
  @IsString()
  imageUrl: string;
}
