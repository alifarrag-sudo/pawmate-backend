import {
  IsUUID,
  IsEnum,
  IsISO8601,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'Sitter user ID' })
  @IsUUID()
  petFriendId: string;

  // Service taxonomy — accepts the new uppercase values (BOARDING, WALKING,
  // DAY_CARE, …) plus the legacy lowercase values that the Prisma migration
  // kept for backfill (dog_walking, overnight_stay, …). Validating against
  // ServiceType keeps the DTO and the DB enum in sync.
  @ApiProperty({ enum: ServiceType, description: 'See Prisma ServiceType enum.' })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiProperty({ enum: ['hourly', 'daily', 'weekly', 'monthly'] })
  @IsEnum(['hourly', 'daily', 'weekly', 'monthly'])
  bookingType: 'hourly' | 'daily' | 'weekly' | 'monthly';

  @ApiProperty({ example: '2024-08-15T09:00:00.000Z' })
  @IsISO8601({ strict: true }, { message: 'requestedStart must be a valid ISO 8601 date' })
  requestedStart: string;

  @ApiProperty({ example: '2024-08-15T11:00:00.000Z' })
  @IsISO8601({ strict: true }, { message: 'requestedEnd must be a valid ISO 8601 date' })
  requestedEnd: string;

  @ApiProperty({ description: 'Array of pet UUIDs to include', example: ['uuid-1'] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one pet must be selected' })
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  petIds: string[];

  @ApiProperty({ enum: ['owner_home', 'sitter_home', 'custom'] })
  @IsEnum(['owner_home', 'sitter_home', 'custom'])
  serviceLocationType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  serviceLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  serviceLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceAddress?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Special instructions must not exceed 500 characters' })
  specialInstructions?: string;

  @ApiProperty({ enum: ['card', 'mobile_wallet', 'fawry', 'platform_wallet'] })
  @IsEnum(['card', 'mobile_wallet', 'fawry', 'platform_wallet'])
  paymentMethod: string;

  // ── New per-service pricing inputs ──────────────────────────────
  // The pricing engine routes on serviceType. These are optional at the DTO
  // level (so legacy clients still parse) but the bookings service rejects
  // requests where the field required for the chosen serviceType is missing.

  @ApiPropertyOptional({
    description: 'Number of nights for BOARDING bookings (≥ 1).',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  numberOfNights?: number;

  @ApiPropertyOptional({
    description: 'Number of hours for WALKING bookings (≥ provider minimum).',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  numberOfHours?: number;

  @ApiPropertyOptional({
    description: 'Session length for DAY_CARE bookings.',
    enum: ['SIX_HOUR', 'EIGHT_HOUR'],
  })
  @IsOptional()
  @IsEnum(['SIX_HOUR', 'EIGHT_HOUR'])
  sessionType?: 'SIX_HOUR' | 'EIGHT_HOUR';
}
