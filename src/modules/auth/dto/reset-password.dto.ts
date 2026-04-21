import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token from the password reset email link' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPass123!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least 1 uppercase letter and 1 number.',
  })
  newPassword: string;
}
