import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ContactType {
  PARENT = 'PARENT',
  PROVIDER = 'PROVIDER',
  BUSINESS = 'BUSINESS',
  PRESS = 'PRESS',
  OTHER = 'OTHER',
}

export class CreateContactDto {
  @ApiProperty({ example: 'Ahmed Hassan', description: 'Full name of the person submitting the contact form' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'ahmed@example.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @ApiProperty({
    enum: ContactType,
    example: ContactType.PARENT,
    description: 'Category of the contact enquiry',
  })
  @IsEnum(ContactType, { message: 'type must be one of: PARENT, PROVIDER, BUSINESS, PRESS, OTHER' })
  type: ContactType;

  @ApiProperty({
    example: 'I have a question about becoming a PetFriend provider.',
    description: 'Contact message body (max 2000 characters)',
  })
  @IsString()
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(2000, { message: 'Message must be at most 2000 characters' })
  message: string;
}
