import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsBoolean,
  IsInt,
  IsDateString,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Apply Kennel ─────────────────────────────────────────────────────────────

export class ApplyKennelDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalUnits: number;

  @ApiPropertyOptional({ enum: ['STANDARD', 'LUXURY', 'MEDICAL', 'SMALL_DOG_ONLY', 'LARGE_DOG_ONLY'] })
  @IsOptional()
  @IsEnum(['STANDARD', 'LUXURY', 'MEDICAL', 'SMALL_DOG_ONLY', 'LARGE_DOG_ONLY'] as const)
  facilityType?: string;

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
  acceptsOtherPets?: boolean;

  @ApiPropertyOptional({ description: 'Per-unit pet weight limit in kg' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  maxPetWeightKg?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  providesFood?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  providesBedding?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  providesPlayArea?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  @Type(() => Number)
  playAreaHoursPerDay?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  walksPerDay?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  photoUpdatesPerDay?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  airConditioned?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  heated?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  securityMonitored?: boolean;

  @ApiProperty({ description: 'Pickup/drop-off schedule JSON: { mon: {open, close}, ... }' })
  pickupDropoffJson: any;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pricePerNightEgp: number;

  @ApiPropertyOptional({ description: 'Discounted price for long stays' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pricePerNightLongStayEgp?: number;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(90)
  @Type(() => Number)
  longStayThresholdNights?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresVaccinationProof?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresDewormingProof?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresHealthCertificate?: boolean;

  @ApiPropertyOptional({ type: [String], default: ['rabies', 'DHPP', 'bordetella'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredVaccines?: string[];

  @ApiPropertyOptional({ type: [String], default: ['FVRCP', 'rabies'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCatVaccines?: string[];

  @ApiPropertyOptional({ description: 'Custom liability waiver text (defaults to template)' })
  @IsOptional()
  @IsString()
  @MinLength(50)
  liabilityWaiverText?: string;
}

// ─── Update Kennel Profile ────────────────────────────────────────────────────

export class UpdateKennelProfileDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalUnits?: number;

  @ApiPropertyOptional({ enum: ['STANDARD', 'LUXURY', 'MEDICAL', 'SMALL_DOG_ONLY', 'LARGE_DOG_ONLY'] })
  @IsOptional()
  @IsEnum(['STANDARD', 'LUXURY', 'MEDICAL', 'SMALL_DOG_ONLY', 'LARGE_DOG_ONLY'] as const)
  facilityType?: string;

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
  acceptsOtherPets?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  maxPetWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  providesFood?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  providesBedding?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  providesPlayArea?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  @Type(() => Number)
  playAreaHoursPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  walksPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  photoUpdatesPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  airConditioned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  heated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  securityMonitored?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  pickupDropoffJson?: any;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pricePerNightEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pricePerNightLongStayEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(90)
  @Type(() => Number)
  longStayThresholdNights?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresVaccinationProof?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresDewormingProof?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresHealthCertificate?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredVaccines?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCatVaccines?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(50)
  liabilityWaiverText?: string;
}

// ─── Kennel Unit ──────────────────────────────────────────────────────────────

export class CreateKennelUnitDto {
  @ApiProperty({ example: 'A-1' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitNumber: string;

  @ApiProperty({ example: 'STANDARD' })
  @IsString()
  @MinLength(1)
  unitType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Type(() => Number)
  sizeSquareMeters?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasOutdoorAccess?: boolean;

  @ApiPropertyOptional({ type: [String], default: ['SMALL', 'MEDIUM'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitableForSize?: string[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  maxOccupancy?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateKennelUnitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  unitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Type(() => Number)
  sizeSquareMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOutdoorAccess?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitableForSize?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  maxOccupancy?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export class SetMaintenanceDto {
  @ApiProperty({ description: 'Date until unit is under maintenance (ISO 8601)' })
  @IsDateString()
  inMaintenanceUntil: string;
}

// ─── Intake ───────────────────────────────────────────────────────────────────

export class PerformIntakeDto {
  @ApiProperty()
  @IsString()
  bookingId: string;

  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(200)
  @Type(() => Number)
  intakeWeight?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  intakePhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  intakeNotes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vaccinationDocs?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dewormingDocs?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  healthCerts?: string[];

  @ApiPropertyOptional({ description: 'Signed waiver PDF URL (Cloudinary)' })
  @IsOptional()
  @IsString()
  liabilityWaiverSignatureUrl?: string;
}

// ─── Daily Log ────────────────────────────────────────────────────────────────

export class DailyLogDto {
  @ApiProperty({ enum: ['HAPPY', 'CALM', 'ANXIOUS', 'PLAYFUL', 'LETHARGIC', 'AGGRESSIVE'] })
  @IsString()
  mood: string;

  @ApiProperty({ enum: ['NORMAL', 'REDUCED', 'NONE', 'INCREASED'] })
  @IsString()
  appetite: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  @Type(() => Number)
  exerciseMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}

// ─── Discharge ────────────────────────────────────────────────────────────────

export class DischargeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(200)
  @Type(() => Number)
  dischargeWeight?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dischargePhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  dischargeNotes?: string;
}

// ─── Extend Stay ──────────────────────────────────────────────────────────────

export class ExtendStayDto {
  @ApiProperty({ description: 'New expected check-out date (ISO 8601)' })
  @IsDateString()
  newExpectedCheckOutAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ description: 'Additional cost in EGP for the extension' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  additionalCostEgp?: number;
}

// ─── Medical Hold ─────────────────────────────────────────────────────────────

export class MedicalHoldDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  vetContact?: string;
}
