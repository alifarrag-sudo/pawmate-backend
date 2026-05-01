import { IsISO8601, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RecordPickupDto {
  @ApiProperty({ description: 'Actual pickup datetime (ISO-8601). Defaults to server now if omitted.' })
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? value : undefined))
  pickupTime?: string;
}
