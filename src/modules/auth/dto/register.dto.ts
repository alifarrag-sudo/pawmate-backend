import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Ahmed' })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Hassan' })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'Min 8 characters' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(100)
  password: string;

  @ApiPropertyOptional({ enum: ['PARENT', 'PETFRIEND', 'BOTH'], example: 'PARENT' })
  @IsOptional()
  @IsIn(['PARENT', 'PETFRIEND', 'BOTH', 'parent', 'petfriend', 'both', 'owner', 'sitter'])
  role?: string;

  @ApiPropertyOptional({ enum: ['ar', 'en'], example: 'en' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en';
}
