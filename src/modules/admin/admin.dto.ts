import { IsString, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── GET /admin/providers query ────────────────────────────────────────────────

export class GetProvidersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

// ── GET /admin/parents query ──────────────────────────────────────────────────

export class GetParentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['power', 'at_risk', 'new'] })
  @IsOptional()
  @IsIn(['power', 'at_risk', 'new'])
  segment?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

// ── GET /admin/financials/breakdown query ─────────────────────────────────────

export class GetFinancialBreakdownQueryDto {
  @ApiPropertyOptional({ enum: ['month', 'quarter', 'year'], default: 'month' })
  @IsOptional()
  @IsIn(['month', 'quarter', 'year'])
  period?: string;
}

// ── POST /admin/agents/brief body ─────────────────────────────────────────────

export const KNOWN_AGENTS = [
  'nadia', 'farida', 'salma', 'layla', 'yasmin', 'hana', 'dina',
  'mariam', 'noura', 'rania', 'amira', 'lina', 'safiya', 'jana',
] as const;

export type KnownAgentId = typeof KNOWN_AGENTS[number];

export const AGENT_NAMES: Record<KnownAgentId, string> = {
  nadia: 'Nadia (COO)',
  farida: 'Farida (CTO)',
  salma: 'Salma (CFO)',
  layla: 'Layla (Full-Stack Engineer)',
  yasmin: 'Yasmin (UI/UX Lead)',
  hana: 'Hana (QA Engineer)',
  dina: 'Dina (Data & Analytics)',
  mariam: 'Mariam (Growth Lead)',
  noura: 'Noura (Customer Success)',
  rania: 'Rania (Provider Relations)',
  amira: 'Amira (Financial Analyst)',
  lina: 'Lina (Legal & Compliance)',
  safiya: 'Safiya (Security)',
  jana: 'Jana (Executive Assistant)',
};

export class BriefAgentDto {
  @ApiProperty({ description: 'One of the 14 known agent IDs' })
  @IsString()
  agentId: string;

  @ApiProperty()
  @IsString()
  task: string;

  @ApiProperty()
  @IsString()
  context: string;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority: string;
}
