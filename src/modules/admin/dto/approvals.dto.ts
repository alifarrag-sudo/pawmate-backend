import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApprovalStatus } from '@prisma/client';

/**
 * GET /admin/approvals — query filters.
 *
 * status, agentId, actionType, and routing are all optional. limit defaults
 * to 50; the web /owners/approvals view paginates client-side from a single
 * pull of pending items.
 */
export class GetApprovalsQueryDto {
  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus | 'pending' | 'approved' | 'rejected' | 'expired';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actionType?: string;

  @ApiPropertyOptional({ description: '"ali_only" | "ali_or_john"' })
  @IsOptional()
  @IsString()
  routing?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * POST /admin/approvals — create proposal.
 *
 * Called by AI agents (or an admin manually). Both `agentId` and `actionType`
 * are free-form strings; the Command Center is the consumer that gives them
 * meaning.
 */
export class CreateApprovalDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  agentId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  actionType: string;

  @ApiProperty({ description: 'Free-form payload describing the action.' })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasoning?: string;

  @ApiPropertyOptional({ description: '"ali_only" | "ali_or_john" (default).' })
  @IsOptional()
  @IsString()
  routing?: string;
}

/**
 * POST /admin/approvals/:id/resolve — approve or reject.
 */
export class ResolveApprovalDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  action: 'approved' | 'rejected';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
