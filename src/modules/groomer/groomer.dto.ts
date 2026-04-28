import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Nested: Service definition for apply ────────────────────────────────────

export class ServiceDefinitionDto {
  @ApiProperty({
    enum: [
      'BATH_ONLY', 'HAIRCUT_ONLY', 'NAIL_TRIM', 'EAR_CLEANING',
      'TEETH_BRUSHING', 'ANAL_GLAND_EXPRESSION', 'FULL_GROOM',
      'LUXURY_GROOM', 'PUPPY_FIRST_GROOM', 'DEMATTING',
      'FLEA_TREATMENT_BATH', 'CUSTOM',
    ],
  })
  @IsString()
  serviceType: string;

  @ApiProperty({ description: 'Display name for this service' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Duration in minutes', minimum: 5 })
  @IsInt()
  @Min(5)
  @Type(() => Number)
  durationMinutes: number;

  @ApiPropertyOptional({ description: 'Price for small pets (<=10kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceSmallEgp?: number;

  @ApiPropertyOptional({ description: 'Price for medium pets (10-25kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceMediumEgp?: number;

  @ApiPropertyOptional({ description: 'Price for large pets (25-45kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceLargeEgp?: number;

  @ApiPropertyOptional({ description: 'Price for XL pets (>45kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceXLEgp?: number;

  @ApiPropertyOptional({ description: 'Flat price (overrides size-based pricing) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceFlat?: number;

  @ApiPropertyOptional({ description: 'Mobile van surcharge in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  mobileVanSurchargeEgp?: number;
}

// ─── Apply Groomer ───────────────────────────────────────────────────────────

export class ApplyGroomerDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasSalon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salonAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salonLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salonLng?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasMobileVan?: boolean;

  @ApiPropertyOptional({ description: 'Mobile van service radius in km' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  mobileVanRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Mobile van cost in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  mobileVanCostEgp?: number;

  @ApiPropertyOptional({ description: 'Free van delivery above this EGP threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  freeVanAboveEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  experienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  acceptsDogs?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptsCats?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  acceptsOther?: boolean;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  @Type(() => Number)
  slotDurationMinutes?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  advanceBookingDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sameHourBooking?: boolean;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  cancellationWindowHours?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioPhotosUrls?: string[];

  @ApiProperty({
    type: [ServiceDefinitionDto],
    description: 'At least one service must be provided',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceDefinitionDto)
  services: ServiceDefinitionDto[];
}

// ─── Update Groomer Profile ──────────────────────────────────────────────────

export class UpdateGroomerProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasSalon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salonAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salonLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  salonLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasMobileVan?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  mobileVanRadiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  mobileVanCostEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  freeVanAboveEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  experienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsDogs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsCats?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsOther?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  @Type(() => Number)
  slotDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  advanceBookingDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sameHourBooking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  cancellationWindowHours?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  portfolioPhotosUrls?: string[];
}

// ─── Create Service ──────────────────────────────────────────────────────────

export class CreateServiceDto {
  @ApiProperty({
    enum: [
      'BATH_ONLY', 'HAIRCUT_ONLY', 'NAIL_TRIM', 'EAR_CLEANING',
      'TEETH_BRUSHING', 'ANAL_GLAND_EXPRESSION', 'FULL_GROOM',
      'LUXURY_GROOM', 'PUPPY_FIRST_GROOM', 'DEMATTING',
      'FLEA_TREATMENT_BATH', 'CUSTOM',
    ],
  })
  @IsString()
  serviceType: string;

  @ApiProperty({ description: 'Display name for this service' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Duration in minutes', minimum: 5 })
  @IsInt()
  @Min(5)
  @Type(() => Number)
  durationMinutes: number;

  @ApiPropertyOptional({ description: 'Price for small pets (<=10kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceSmallEgp?: number;

  @ApiPropertyOptional({ description: 'Price for medium pets (10-25kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceMediumEgp?: number;

  @ApiPropertyOptional({ description: 'Price for large pets (25-45kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceLargeEgp?: number;

  @ApiPropertyOptional({ description: 'Price for XL pets (>45kg) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceXLEgp?: number;

  @ApiPropertyOptional({ description: 'Flat price (overrides size-based pricing) in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceFlat?: number;

  @ApiPropertyOptional({ description: 'Mobile van surcharge in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  mobileVanSurchargeEgp?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;
}

// ─── Update Service ──────────────────────────────────────────────────────────

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 5 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Type(() => Number)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceSmallEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceMediumEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceLargeEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceXLEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceFlat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  mobileVanSurchargeEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Start Appointment ───────────────────────────────────────────────────────

export class StartAppointmentDto {
  @ApiPropertyOptional({ type: [String], description: 'Before photos Cloudinary URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  beforePhotosUrls?: string[];

  @ApiPropertyOptional({ description: 'Notes taken at the start of the appointment' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Complete Appointment ────────────────────────────────────────────────────

export class CompleteAppointmentDto {
  @ApiPropertyOptional({ type: [String], description: 'After photos Cloudinary URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  afterPhotosUrls?: string[];

  @ApiPropertyOptional({ description: 'Grooming notes' })
  @IsOptional()
  @IsString()
  groomingNotes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Any reactions observed during grooming' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reactionsObserved?: string[];

  @ApiProperty({ description: 'Actual duration in minutes' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  actualDurationMin: number;
}

// ─── Upload Photos ───────────────────────────────────────────────────────────

export class UploadPhotosDto {
  @ApiProperty({ type: [String], description: 'Cloudinary URLs for photos' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  urls: string[];
}

// ─── Share Appointment ───────────────────────────────────────────────────────

export class ShareAppointmentDto {
  @ApiPropertyOptional({ default: true, description: 'Share by parent (always true from parent context)' })
  @IsOptional()
  @IsBoolean()
  sharedByParent?: boolean;
}

// ─── Update Allergy Notes ────────────────────────────────────────────────────

export class UpdateAllergyNotesDto {
  @ApiProperty({ description: 'Updated allergy notes for this pet' })
  @IsString()
  allergyNotes: string;

  @ApiPropertyOptional({ type: [String], description: 'Products to avoid' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productsToAvoid?: string[];
}
