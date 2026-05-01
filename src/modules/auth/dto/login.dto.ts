import { IsString, IsEmail, IsOptional, ValidateIf } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

/**
 * Login accepts EITHER email OR phone — at least one must be provided.
 * `@ValidateIf` makes each conditional on the other being absent so the
 * request validates as long as one identifier is supplied.
 */
export class LoginDto {
  @ApiPropertyOptional({ example: 'ahmed@example.com', description: 'Email — required if phone not provided' })
  @ValidateIf((o) => !o.phone)
  @IsEmail({}, { message: 'Must be a valid email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+201012345678', description: 'Phone in E.164 — required if email not provided' })
  @ValidateIf((o) => !o.email)
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password: string;
}
