import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  IsDecimal,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationAction } from '@prisma/client';

export class CreateReviewDto {
  @ApiProperty({ description: 'ID of the completed booking' })
  @IsString()
  bookingId: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: 'Overall rating 1-5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ type: [String], description: 'Tags for the review' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  tags?: string[];

  @ApiPropertyOptional({ description: 'Free-text comment' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ description: 'Would rebook this provider' })
  @IsOptional()
  @IsBoolean()
  wouldRebook?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Photo URLs (Cloudinary)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  photos?: string[];

  // Sub-ratings (optional)
  @ApiPropertyOptional({ description: 'Communication sub-rating (1.00 - 5.00)' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratingCommunication?: string;

  @ApiPropertyOptional({ description: 'Reliability sub-rating' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratingReliability?: string;

  @ApiPropertyOptional({ description: 'Care quality sub-rating' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratingCareQuality?: string;

  @ApiPropertyOptional({ description: 'Value sub-rating' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratingValue?: string;
}

export class FlagReviewDto {
  @ApiProperty({ description: 'Reason for flagging the review' })
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class SubmitReplyDto {
  @ApiProperty({ description: 'Draft reply text from the provider' })
  @IsString()
  @MaxLength(2000)
  replyText: string;
}

export class ModerateReviewDto {
  @ApiProperty({ enum: ModerationAction, description: 'Moderation action to take' })
  @IsEnum(ModerationAction)
  action: ModerationAction;

  @ApiPropertyOptional({ description: 'Edited comment text (if action is "edited")' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  editedText?: string;

  @ApiPropertyOptional({ description: 'Internal moderation note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  moderationNote?: string;
}

export class ModerateReplyDto {
  @ApiProperty({ enum: ['approve', 'reject'], description: 'Approve or reject the draft reply' })
  @IsEnum(['approve', 'reject'] as const)
  action: 'approve' | 'reject';

  @ApiPropertyOptional({ description: 'Rejection reason (required if action is reject)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
