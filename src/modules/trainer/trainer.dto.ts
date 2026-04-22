import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsNumber,
  IsArray,
  IsIn,
  IsDateString,
  IsObject,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ──────────────────────────────────────────────────────────────────────────────
// Apply to become a Trainer — shell creation, no required fields
// ──────────────────────────────────────────────────────────────────────────────
export class ApplyTrainerDto {}

// ──────────────────────────────────────────────────────────────────────────────
// Update Trainer profile (incremental — all fields optional)
// ──────────────────────────────────────────────────────────────────────────────
export class UpdateTrainerProfileDto {
  @ApiPropertyOptional({ description: 'Short bio / training philosophy' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ description: 'Specialties', example: ['OBEDIENCE', 'BEHAVIOR_CORRECTION'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ description: 'Years of training experience' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  experienceYears?: number;

  @ApiPropertyOptional({ description: 'Languages spoken', example: ['Arabic', 'English'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Offers in-home visits' })
  @IsOptional()
  @IsBoolean()
  inHomeVisits?: boolean;

  @ApiPropertyOptional({ description: 'Has own training facility' })
  @IsOptional()
  @IsBoolean()
  ownFacility?: boolean;

  @ApiPropertyOptional({ description: 'Facility address (if ownFacility=true)' })
  @IsOptional()
  @IsString()
  facilityAddress?: string;

  @ApiPropertyOptional({ description: 'Offers virtual video sessions' })
  @IsOptional()
  @IsBoolean()
  virtualSessions?: boolean;

  @ApiPropertyOptional({ description: 'Service radius in km (for in-home visits)', minimum: 3, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(50)
  @Type(() => Number)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Base latitude' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  baseLat?: number;

  @ApiPropertyOptional({ description: 'Base longitude' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  baseLng?: number;

  @ApiPropertyOptional({
    description: 'Services with pricing — array of {type, priceEgp, description, deliveryMode}',
  })
  @IsOptional()
  @IsArray()
  servicesJson?: Array<{
    type: string;
    priceEgp: number;
    description?: string;
    deliveryMode: string;
  }>;

  @ApiPropertyOptional({ description: 'Certifications JSON — [{name, issuer, year, url}]' })
  @IsOptional()
  @IsArray()
  certificationsJson?: Array<{
    name: string;
    issuer: string;
    year: number;
    url?: string;
  }>;

  @ApiPropertyOptional({ description: 'Weekly availability schedule as JSON' })
  @IsOptional()
  @IsObject()
  availabilityJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Max sessions per day', minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  maxSessionsPerDay?: number;

  @ApiPropertyOptional({ description: 'Payout method details as JSON' })
  @IsOptional()
  @IsObject()
  payoutMethodJson?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin review
// ──────────────────────────────────────────────────────────────────────────────
export class TrainerAdminReviewDto {
  @ApiProperty({ enum: ['approve', 'reject'], description: 'Review outcome' })
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Required when action is reject' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin suspend
// ──────────────────────────────────────────────────────────────────────────────
export class TrainerSuspendDto {
  @ApiProperty({ description: 'Reason for suspension' })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiPropertyOptional({ description: 'ISO date — suspend until this date; omit for indefinite' })
  @IsOptional()
  @IsDateString()
  until?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Instant cashout
// ──────────────────────────────────────────────────────────────────────────────
export class TrainerInstantCashoutDto {}

// ──────────────────────────────────────────────────────────────────────────────
// Trainer search query
// ──────────────────────────────────────────────────────────────────────────────
export class SearchTrainersDto {
  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by specialty' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Filter by delivery mode: IN_HOME | FACILITY | VIRTUAL' })
  @IsOptional()
  @IsString()
  deliveryMode?: string;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mark session complete (for programs)
// ──────────────────────────────────────────────────────────────────────────────
export class MarkSessionCompleteDto {
  @ApiPropertyOptional({ description: 'Session notes' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Homework assigned to parent/pet' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  homework?: string;
}
