import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsInt,
  IsEnum,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Apply Vet ──────────────────────────────────────────────────────────────

export class ApplyVetDto {
  @ApiProperty({ description: 'Veterinary license number' })
  @IsString()
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'Cloudinary URL for syndicate card image' })
  @IsOptional()
  @IsString()
  syndicateCardUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinicName?: string;

  @ApiProperty({
    type: [String],
    enum: [
      'GENERAL_PRACTICE', 'SURGERY', 'DENTISTRY', 'DERMATOLOGY', 'CARDIOLOGY',
      'ONCOLOGY', 'OPHTHALMOLOGY', 'ORTHOPEDICS', 'INTERNAL_MEDICINE',
      'EXOTIC_ANIMALS', 'EMERGENCY_CRITICAL_CARE', 'BEHAVIOR',
    ],
    description: 'Array of VetSpecialty values',
  })
  @IsArray()
  @IsString({ each: true })
  specialties: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  offersInClinic?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  offersHomeVisits?: boolean;

  @ApiPropertyOptional({ description: 'Home visit radius in km' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  homeVisitRadiusKm?: number;

  @ApiPropertyOptional({ description: 'Home visit cost in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeVisitCostEgp?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  offersVideoConsult?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  offersEmergency?: boolean;

  @ApiPropertyOptional({ description: 'Emergency hotline phone' })
  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @ApiPropertyOptional({ description: 'Emergency availability description' })
  @IsOptional()
  @IsString()
  emergencyAvailability?: string;

  @ApiProperty({ description: 'In-clinic consultation fee in EGP', minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  consultationFeeEgp: number;

  @ApiPropertyOptional({ description: 'Home visit fee in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeVisitFeeEgp?: number;

  @ApiPropertyOptional({ description: 'Video consultation fee in EGP' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  videoConsultFeeEgp?: number;

  @ApiPropertyOptional({ description: 'PDPL consent text displayed to pet parents' })
  @IsOptional()
  @IsString()
  consentText?: string;
}

// ─── Update Vet Profile ─────────────────────────────────────────────────────

export class UpdateVetProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinicName?: string;

  @ApiPropertyOptional({ description: 'Cloudinary URL for syndicate card image' })
  @IsOptional()
  @IsString()
  syndicateCardUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: [
      'GENERAL_PRACTICE', 'SURGERY', 'DENTISTRY', 'DERMATOLOGY', 'CARDIOLOGY',
      'ONCOLOGY', 'OPHTHALMOLOGY', 'ORTHOPEDICS', 'INTERNAL_MEDICINE',
      'EXOTIC_ANIMALS', 'EMERGENCY_CRITICAL_CARE', 'BEHAVIOR',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersInClinic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersHomeVisits?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  homeVisitRadiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeVisitCostEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersVideoConsult?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersEmergency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyAvailability?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  consultationFeeEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeVisitFeeEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  videoConsultFeeEgp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consentText?: string;
}

// ─── Create Affiliation ─────────────────────────────────────────────────────

export class CreateAffiliationDto {
  @ApiProperty({ description: 'Name of the institution (hospital, university, etc.)' })
  @IsString()
  institutionName: string;

  @ApiPropertyOptional({ description: 'Role at the institution' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'License or ID at the institution' })
  @IsOptional()
  @IsString()
  licenseOrId?: string;

  @ApiPropertyOptional({ description: 'Cloudinary URL for supporting document' })
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

// ─── Create Consultation ────────────────────────────────────────────────────

export class CreateConsultationDto {
  @ApiProperty({ description: 'Pet ID' })
  @IsString()
  petId: string;

  @ApiPropertyOptional({ description: 'Booking ID (optional link)' })
  @IsOptional()
  @IsString()
  bookingId?: string;

  @ApiProperty({
    enum: ['IN_CLINIC', 'HOME_VISIT', 'VIDEO_CONSULT', 'EMERGENCY', 'FOLLOW_UP'],
  })
  @IsString()
  consultationType: string;

  @ApiPropertyOptional({ description: 'Chief complaint (encrypted at rest)' })
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ description: 'Clinical findings (encrypted at rest)' })
  @IsOptional()
  @IsString()
  findings?: string;

  @ApiPropertyOptional({ description: 'Diagnosis (encrypted at rest)' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'Treatment plan (encrypted at rest)' })
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiPropertyOptional({ description: 'Additional notes (encrypted at rest)' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Pet weight in kg' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number;

  @ApiPropertyOptional({ description: 'Temperature in Celsius' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Heart rate (bpm)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  heartRate?: number;

  @ApiPropertyOptional({ description: 'Follow-up date (ISO string)' })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiProperty({
    description: 'Parent consent for medical record creation (PDPL Law 151/2020)',
    default: false,
  })
  @IsBoolean()
  parentConsentGiven: boolean;
}

// ─── Update Consultation ────────────────────────────────────────────────────

export class UpdateConsultationDto {
  @ApiPropertyOptional({ description: 'Chief complaint (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional({ description: 'Clinical findings (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  findings?: string;

  @ApiPropertyOptional({ description: 'Diagnosis (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'Treatment plan (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @ApiPropertyOptional({ description: 'Additional notes (re-encrypted at rest)' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Pet weight in kg' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number;

  @ApiPropertyOptional({ description: 'Temperature in Celsius' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Heart rate (bpm)' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  heartRate?: number;

  @ApiPropertyOptional({ description: 'Follow-up date (ISO string), null to clear' })
  @IsOptional()
  @IsString()
  followUpDate?: string | null;
}

// ─── Create Prescription ────────────────────────────────────────────────────

export class CreatePrescriptionDto {
  @ApiProperty({ description: 'Consultation ID' })
  @IsString()
  consultationId: string;

  @ApiProperty({
    description: 'Medications JSON (will be encrypted at rest)',
    example: '[{ "name": "Amoxicillin", "dose": "250mg", "frequency": "twice daily", "duration": "7 days" }]',
  })
  @IsString()
  medications: string;

  @ApiPropertyOptional({ description: 'Instructions (will be encrypted at rest)' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({ description: 'Expiry date (ISO string)' })
  @IsDateString()
  expiresAt: string;
}
