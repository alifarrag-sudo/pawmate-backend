import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SaveProgressDto {
  @ApiProperty({
    example: 1,
    description: 'Current step number in the multi-step application (1-based)',
    minimum: 1,
    maximum: 20,
  })
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  step: number;

  @ApiProperty({
    example: { providerType: 'PETFRIEND', city: 'Cairo', bio: 'I love animals!' },
    description: 'Arbitrary step data — stored as JSON; validated by the frontend per step',
  })
  @IsObject()
  data: Record<string, unknown>;
}

export class ResumeApplicationDto {
  @ApiPropertyOptional({
    example: 'ahmed@example.com',
    description: 'Email address used to look up a guest (unauthenticated) draft',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
