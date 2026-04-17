import {
  IsString,
  IsPhoneNumber,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsEnum,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: '+201012345678', description: 'Egyptian phone number' })
  @IsString()
  @Matches(/^\+20[0-9]{10}$/, {
    message: 'Phone must be a valid Egyptian number starting with +20 (e.g., +201012345678)',
  })
  phone: string;

  @ApiPropertyOptional({ example: 'ahmed@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email?: string;

  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(100)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#).',
    },
  )
  password: string;

  @ApiProperty({ enum: ['owner', 'sitter', 'both'], example: 'owner' })
  @IsIn(['owner', 'sitter', 'both'], { message: 'Role must be owner, sitter, or both' })
  role: 'owner' | 'sitter' | 'both';

  @ApiPropertyOptional({ enum: ['ar', 'en'], example: 'ar' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';
}
