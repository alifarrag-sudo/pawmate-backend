import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class SendMessageDto {
  @ApiProperty({ example: 'Could you share the latest unit economics breakdown?' })
  @IsString()
  @MinLength(1, { message: 'Message body must not be empty' })
  @MaxLength(5000, { message: 'Message body must not exceed 5000 characters' })
  body: string;
}

export class CreateInvestorUpdateDto {
  @ApiProperty({ example: 'Q1 2026 Metrics Update' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '## Highlights\n- GMV grew 40% MoM...' })
  @IsString()
  @MinLength(10)
  @MaxLength(50000)
  body: string;

  @ApiPropertyOptional({ example: '2026-04-28' })
  @IsOptional()
  @IsString()
  date?: string;
}

export class UploadInvestorDocDto {
  @ApiProperty({ example: 'Q1 Financial Model' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'financials' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  section: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/pawmate/raw/upload/v1/investor/q1-model.xlsx' })
  @IsString()
  fileUrl: string;
}
