import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Param,
  Body,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VetService } from './vet.service';
import { ConsultationService } from './consultation.service';
import { PrescriptionService } from './prescription.service';
import {
  ApplyVetDto,
  UpdateVetProfileDto,
  CreateAffiliationDto,
  CreateConsultationDto,
  UpdateConsultationDto,
  CreatePrescriptionDto,
} from './vet.dto';

@ApiTags('vet')
@Controller('vet')
export class VetController {
  constructor(
    private readonly vetService: VetService,
    private readonly consultationService: ConsultationService,
    private readonly prescriptionService: PrescriptionService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Part C — Vet Profile Management
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a vet clinic profile (requires VET_CLINIC business)' })
  apply(@Request() req: any, @Body() dto: ApplyVetDto) {
    return this.vetService.applyForVet(req.user.sub, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update vet profile fields' })
  updateProfile(@Request() req: any, @Body() dto: UpdateVetProfileDto) {
    return this.vetService.updateProfile(req.user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user vet profile (operator view)' })
  getMyProfile(@Request() req: any) {
    return this.vetService.getMyProfile(req.user.sub);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Get vet clinic public profile (stats only, never encrypted fields)' })
  @ApiParam({ name: 'id', description: 'Vet profile ID' })
  getPublicProfile(@Param('id') id: string) {
    return this.vetService.getPublicProfile(id);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Search vet clinics' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'specialty', required: false, description: 'VetSpecialty enum value' })
  @ApiQuery({ name: 'affiliationVerified', required: false, type: Boolean })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false })
  searchVets(
    @Query('city') city?: string,
    @Query('specialty') specialty?: string,
    @Query('affiliationVerified') affiliationVerified?: string,
    @Query('q') query?: string,
    @Query('page') page?: string,
  ) {
    return this.vetService.searchVets({
      city,
      specialty,
      affiliationVerified: affiliationVerified === 'true',
      query,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // ── Affiliations ────────────────────────────────────────────────────────────

  @Post('affiliations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add an affiliation to the vet profile' })
  createAffiliation(@Request() req: any, @Body() dto: CreateAffiliationDto) {
    return this.vetService.createAffiliation(req.user.sub, dto);
  }

  @Get('affiliations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all affiliations for the current vet profile' })
  getAffiliations(@Request() req: any) {
    return this.vetService.getAffiliations(req.user.sub);
  }

  // ── Admin Review ────────────────────────────────────────────────────────────

  @Post('admin/affiliations/:id/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: verify or reject an affiliation' })
  @ApiParam({ name: 'id', description: 'Affiliation ID' })
  adminVerifyAffiliation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { approve: boolean; rejectionReason?: string },
  ) {
    return this.vetService.adminVerifyAffiliation(
      req.user.sub,
      id,
      body.approve,
      body.rejectionReason,
    );
  }

  @Post('admin/profiles/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: approve or reject a vet profile' })
  @ApiParam({ name: 'id', description: 'Vet profile ID' })
  adminReviewProfile(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { approve: boolean },
  ) {
    return this.vetService.adminReviewVetProfile(
      req.user.sub,
      id,
      body.approve,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Part D — Consultations (encrypted medical records)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post(':vetProfileId/consultations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new consultation (vet team only, requires parent consent)' })
  @ApiParam({ name: 'vetProfileId', description: 'Vet profile ID' })
  createConsultation(
    @Request() req: any,
    @Param('vetProfileId') vetProfileId: string,
    @Body() dto: CreateConsultationDto,
  ) {
    return this.consultationService.createConsultation(
      req.user.sub,
      vetProfileId,
      dto,
    );
  }

  @Get('consultations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a consultation (vet team or pet owner)' })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  getConsultation(@Request() req: any, @Param('id') id: string) {
    return this.consultationService.getConsultation(req.user.sub, id);
  }

  @Patch('consultations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a consultation (vet team only)' })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  updateConsultation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateConsultationDto,
  ) {
    return this.consultationService.updateConsultation(req.user.sub, id, dto);
  }

  @Delete('consultations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a consultation (vet team only)' })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  deleteConsultation(@Request() req: any, @Param('id') id: string) {
    return this.consultationService.softDeleteConsultation(req.user.sub, id);
  }

  @Get(':vetProfileId/pets/:petId/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pet medical history at this clinic (vet team or pet owner)' })
  @ApiParam({ name: 'vetProfileId', description: 'Vet profile ID' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  getPetHistory(
    @Request() req: any,
    @Param('vetProfileId') vetProfileId: string,
    @Param('petId') petId: string,
  ) {
    return this.consultationService.getPetHistory(
      req.user.sub,
      vetProfileId,
      petId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Part E — E-Prescriptions (encrypted, tamper-proof)
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('prescriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an e-prescription (vet team only)' })
  createPrescription(@Request() req: any, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionService.createPrescription(req.user.sub, dto);
  }

  @Get('prescriptions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a prescription by ID (vet team or pet owner)' })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  getPrescription(@Request() req: any, @Param('id') id: string) {
    return this.prescriptionService.getPrescription(req.user.sub, id);
  }

  @Get('prescriptions/number/:number')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a prescription by RX number' })
  @ApiParam({ name: 'number', description: 'Prescription number (e.g. RX-2026-000001)' })
  getPrescriptionByNumber(
    @Request() req: any,
    @Param('number') prescriptionNumber: string,
  ) {
    return this.prescriptionService.getPrescriptionByNumber(
      req.user.sub,
      prescriptionNumber,
    );
  }

  @Get('consultations/:consultationId/prescriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all prescriptions for a consultation' })
  @ApiParam({ name: 'consultationId', description: 'Consultation ID' })
  getConsultationPrescriptions(
    @Request() req: any,
    @Param('consultationId') consultationId: string,
  ) {
    return this.prescriptionService.getConsultationPrescriptions(
      req.user.sub,
      consultationId,
    );
  }

  @Post('prescriptions/:id/dispense')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a prescription as dispensed (vet team only)' })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  dispensePrescription(@Request() req: any, @Param('id') id: string) {
    return this.prescriptionService.dispensePrescription(req.user.sub, id);
  }

  @Post('prescriptions/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a prescription (vet team only)' })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  cancelPrescription(@Request() req: any, @Param('id') id: string) {
    return this.prescriptionService.cancelPrescription(req.user.sub, id);
  }
}
