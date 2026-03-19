import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '+201012345678' })
  @IsString()
  @Matches(/^\+20[0-9]{10}$/, { message: 'Invalid Egyptian phone number' })
  phone: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password: string;
}
