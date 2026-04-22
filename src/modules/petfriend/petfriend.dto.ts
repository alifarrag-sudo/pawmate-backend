import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsNumber,
  IsArray,
  IsIn,
  IsDateString,
  Min,
  Max,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ──────────────────────────────────────────────────────────────────────────────
// Apply to become a PetFriend — no required fields at application time.
// Profile is built incrementally through subsequent PATCH + document uploads.
// ──────────────────────────────────────────────────────────────────────────────
export class ApplyPetFriendDto {
  // Intentionally empty — the service creates the profile shell upon request.
  // All fields are filled in via UpdatePetFriendProfileDto and uploadDocument.
}

// ──────────────────────────────────────────────────────────────────────────────
// Update PetFriend profile fields (all optional for incremental completion)
// ──────────────────────────────────────────────────────────────────────────────
export class UpdatePetFriendProfileDto {
  @ApiPropertyOptional({ description: 'Short bio visible on public profile' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Service types offered', example: ['BOARDING', 'WALKING'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  servicesOffered?: string[];

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

  @ApiPropertyOptional({ description: 'Max number of pets per booking', minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  maxPetsPerBooking?: number;

  @ApiPropertyOptional({ description: 'Max dog weight accepted in kg', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxDogSizeKg?: number;

  @ApiPropertyOptional({ description: 'Hourly rate in EGP', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ratePerHour?: number;

  @ApiPropertyOptional({ description: 'Daily rate in EGP', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ratePerDay?: number;

  @ApiPropertyOptional({ description: 'Nightly rate in EGP', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ratePerNight?: number;

  @ApiPropertyOptional({ description: 'Per-walk rate in EGP', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ratePerWalk?: number;

  @ApiPropertyOptional({ description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Comma-separated neighborhood names' })
  @IsOptional()
  @IsString()
  neighborhoods?: string;

  @ApiPropertyOptional({ description: 'Service radius in km', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  serviceRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Base latitude for location' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  baseLat?: number;

  @ApiPropertyOptional({ description: 'Base longitude for location' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  baseLng?: number;

  @ApiPropertyOptional({ description: 'Home type', example: 'apartment' })
  @IsOptional()
  @IsString()
  homeType?: string;

  @ApiPropertyOptional({ description: 'Whether the home has a yard' })
  @IsOptional()
  @IsBoolean()
  hasYard?: boolean;

  @ApiPropertyOptional({ description: 'Weekly availability schedule as JSON' })
  @IsOptional()
  @IsObject()
  availabilityJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Payout method details as JSON' })
  @IsOptional()
  @IsObject()
  payoutMethodJson?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin review decision
// ──────────────────────────────────────────────────────────────────────────────
export class AdminReviewDto {
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
export class SuspendDto {
  @ApiProperty({ description: 'Reason for suspension (shown to PetFriend)' })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiPropertyOptional({ description: 'ISO date string — suspends until this date; omit for indefinite' })
  @IsOptional()
  @IsDateString()
  until?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Instant cashout — no body fields required; validation happens in service
// ──────────────────────────────────────────────────────────────────────────────
export class InstantCashoutDto {
  // No fields — eligibility and fee calculation are done server-side.
}
