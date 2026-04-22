import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsEmail,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Apply ──────────────────────────────────────────────────────────────────

export class ApplyBusinessDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName: string;

  @ApiProperty({ enum: ['KENNEL', 'PET_HOTEL', 'VET_CLINIC', 'SHOP', 'GROOMING_SALON', 'TRAINING_ACADEMY', 'MULTI_SERVICE'] })
  @IsEnum(['KENNEL', 'PET_HOTEL', 'VET_CLINIC', 'SHOP', 'GROOMING_SALON', 'TRAINING_ACADEMY', 'MULTI_SERVICE'] as const)
  businessType: string;

  @ApiProperty()
  @IsEmail()
  businessEmail: string;

  @ApiProperty()
  @IsString()
  businessPhone: string;

  @ApiProperty()
  @IsString()
  primaryAddress: string;

  @ApiProperty()
  @IsString()
  primaryCity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  primaryLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  primaryLng?: number;
}

// ─── Update Profile ─────────────────────────────────────────────────────────

export class UpdateBusinessProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  businessEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  primaryLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  primaryLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commercialRegNumber?: string;
}

// ─── Branches ───────────────────────────────────────────────────────────────

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;
}

// ─── Team Invite ────────────────────────────────────────────────────────────

export class CreateTeamInviteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['MANAGER', 'PROVIDER'], default: 'PROVIDER' })
  @IsOptional()
  @IsIn(['MANAGER', 'PROVIDER'])
  targetRole?: string;

  @ApiPropertyOptional({ enum: ['PETFRIEND', 'TRAINER'], default: 'PETFRIEND' })
  @IsOptional()
  @IsIn(['PETFRIEND', 'TRAINER'])
  targetProviderType?: string;
}

// ─── Direct Create ──────────────────────────────────────────────────────────

export class DirectCreateTeamMemberDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiPropertyOptional({ enum: ['MANAGER', 'PROVIDER'], default: 'PROVIDER' })
  @IsOptional()
  @IsIn(['MANAGER', 'PROVIDER'])
  targetRole?: string;

  @ApiProperty({ enum: ['PETFRIEND', 'TRAINER'] })
  @IsIn(['PETFRIEND', 'TRAINER'])
  targetProviderType: string;

  @ApiPropertyOptional({ description: 'City for provider profile' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Specialties for trainer', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];
}

// ─── Join via invite ────────────────────────────────────────────────────────

export class JoinTeamDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  inviteCode: string;
}

// ─── Update Team Member ─────────────────────────────────────────────────────

export class UpdateTeamMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canAcceptBookings?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canSetOwnAvailability?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canMessageParents?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canWithdrawEarnings?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedBranchId?: string;
}

// ─── Suspend ────────────────────────────────────────────────────────────────

export class SuspendTeamMemberDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  reason: string;
}

// ─── Admin Review ───────────────────────────────────────────────────────────

export class AdminReviewBusinessDto {
  @ApiProperty({ enum: ['approve', 'reject', 'request_review'] })
  @IsIn(['approve', 'reject', 'request_review'])
  action: 'approve' | 'reject' | 'request_review';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export class SearchBusinessesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: ['KENNEL', 'PET_HOTEL', 'VET_CLINIC', 'SHOP', 'GROOMING_SALON', 'TRAINING_ACADEMY', 'MULTI_SERVICE'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;
}
