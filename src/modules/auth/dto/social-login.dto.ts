import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialLoginDto {
  @ApiProperty({ enum: ['google', 'facebook'], example: 'google' })
  @IsIn(['google', 'facebook'])
  provider: 'google' | 'facebook';

  @ApiProperty({ description: 'OAuth access token or ID token from the provider' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ description: 'Email from provider (fallback if token fetch fails)' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Display name from provider' })
  @IsOptional()
  @IsString()
  name?: string;
}
