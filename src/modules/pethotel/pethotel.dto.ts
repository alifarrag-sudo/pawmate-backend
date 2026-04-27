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
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Apply PetHotel ─────────────────────────────────────────────────────────

export class ApplyPetHotelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hotelName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  starRating?: number;

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

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  maxPetsPerRoom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasPool?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasGroomingSpa?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasOnCallVet?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasTrainingProgram?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasLiveCameraAccess?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasPickupDropoffService?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pickupRadiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  pickupCostEgp?: number;

  @ApiProperty({ description: 'JSON: { earliest: "10:00", latest: "18:00" }' })
  @IsObject()
  checkInWindowJson: Record<string, string>;

  @ApiProperty({ description: 'JSON: { earliest: "08:00", latest: "12:00" }' })
  @IsObject()
  checkOutWindowJson: Record<string, string>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresVaccinationProof?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredVaccines?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresDeposit?: boolean;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  depositPercentage?: number;

  @ApiPropertyOptional({ default: 72 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  depositRefundWindowHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  liabilityWaiverText?: string;
}

export class UpdatePetHotelProfileDto extends ApplyPetHotelDto {}

// ─── Room Types ──────────────────────────────────────────────────────────────

export class CreateRoomTypeDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'] })
  @IsEnum(['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'] as const)
  tier: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  squareMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  maxPetWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suitableSizes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pricePerNightEgp: number;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  longStayNights?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  longStayPricePerNightEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photosUrls?: string[];
}

export class UpdateRoomTypeDto extends CreateRoomTypeDto {}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export class CreateRoomDto {
  @ApiProperty()
  @IsString()
  roomTypeId: string;

  @ApiProperty()
  @IsString()
  roomNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cameraStreamUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cameraStreamUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  inMaintenanceUntil?: string;
}

// ─── Packages ────────────────────────────────────────────────────────────────

export class CreatePackageDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  durationNights: number;

  @ApiProperty({ isArray: true, enum: ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'] })
  @IsArray()
  @IsEnum(['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'] as const, { each: true })
  eligibleRoomTiers: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesGrooming?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  groomingSessionsCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesTraining?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  trainingSessionsCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesVetCheckup?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesPhotoshoot?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesTransport?: boolean;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalPriceEgp: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  savingsVsAlaCarte?: number;
}

export class UpdatePackageDto extends CreatePackageDto {}

// ─── Stay Operations ─────────────────────────────────────────────────────────

export class PayBalanceDto {
  @ApiProperty({ description: 'Paymob payment reference' })
  @IsString()
  paymentReference: string;
}

export class PerformIntakeDto {
  @ApiProperty()
  @IsString()
  stayId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  intakePhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  intakeWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  intakeNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vaccinationDocsUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  liabilityWaiverSignatureUrl?: string;
}

export class DailyLogDto {
  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appetite?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  exerciseMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}

export class DischargeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dischargePhotos?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dischargeWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dischargeNotes?: string;
}

export class ExtendStayDto {
  @ApiProperty()
  @IsDateString()
  newCheckOutDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class MedicalHoldDto {
  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vetNotes?: string;
}

export class AddServiceDto {
  @ApiProperty({ enum: ['grooming', 'training', 'vet_checkup'] })
  @IsEnum(['grooming', 'training', 'vet_checkup'] as const)
  type: string;
}
