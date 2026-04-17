import {
  IsUUID,
  IsEnum,
  IsISO8601,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsString,
  IsOptional,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ description: 'Sitter user ID' })
  @IsUUID()
  petFriendId: string;

  @ApiProperty({ enum: ['dog_walking', 'drop_in', 'daycare', 'overnight_boarding', 'house_sitting'] })
  @IsEnum(['dog_walking', 'drop_in', 'daycare', 'overnight_boarding', 'house_sitting'])
  serviceType: string;

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
}
