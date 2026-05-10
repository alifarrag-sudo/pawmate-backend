import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for POST /bookings/:id/meet-greet/consent
 *
 * `consentTextVersion` is REQUIRED — the server rejects requests that
 * don't pin the wording the parent saw. This prevents a stale client
 * (older app version) from silently consenting to text it hasn't
 * rendered.
 */
export class RecordMeetGreetConsentDto {
  @ApiProperty({
    description: 'Whether the parent agreed to the Meet & Greet. False records a WAIVED status.',
    example: true,
  })
  @IsBoolean()
  consentGiven!: boolean;

  @ApiProperty({
    description:
      'The version of the consent text the parent saw on their device. ' +
      'Required — requests without this are rejected with 400.',
    example: 'v1.0',
  })
  @IsString()
  @IsNotEmpty({ message: 'consentTextVersion is required' })
  @MaxLength(32)
  consentTextVersion!: string;

  @ApiProperty({
    required: false,
    description: 'Optional reason when consentGiven=false (e.g. "scheduling conflict").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  waivedReason?: string;
}
