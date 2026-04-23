import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteInvestorDto {
  @ApiProperty({ example: 'sara.investor@vcfund.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'Sara' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'ElMahdy' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName: string;
}
