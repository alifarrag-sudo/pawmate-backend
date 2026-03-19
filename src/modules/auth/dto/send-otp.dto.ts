import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+201012345678' })
  @IsString()
  @Matches(/^\+20[0-9]{10}$/, { message: 'Invalid Egyptian phone number' })
  phone: string;
}
