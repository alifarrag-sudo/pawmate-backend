import {
  Controller,
  Post,
  Patch,
  Put,
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
import { KennelService } from './kennel.service';
import {
  ApplyKennelDto,
  UpdateKennelProfileDto,
  CreateKennelUnitDto,
  UpdateKennelUnitDto,
  SetMaintenanceDto,
  PerformIntakeDto,
  DailyLogDto,
  DischargeDto,
  ExtendStayDto,
  MedicalHoldDto,
} from './kennel.dto';

@ApiTags('kennel')
@Controller('kennel')
export class KennelController {
  constructor(private readonly kennelService: KennelService) {}

  // ── Profile ─────────────────────────────────────────────────────────────────

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a kennel profile (requires KENNEL business)' })
  apply(@Request() req: any, @Body() dto: ApplyKennelDto) {
    return this.kennelService.applyForKennel(req.user.sub, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update kennel profile fields' })
  updateProfile(@Request() req: any, @Body() dto: UpdateKennelProfileDto) {
    return this.kennelService.updateProfile(req.user.sub, dto);
  }

  // ── Units ───────────────────────────────────────────────────────────────────

  @Post('units')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new kennel unit' })
  createUnit(@Request() req: any, @Body() dto: CreateKennelUnitDto) {
    return this.kennelService.createUnit(req.user.sub, dto);
  }

  @Patch('units/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a kennel unit' })
  @ApiParam({ name: 'id', description: 'Kennel unit ID' })
  updateUnit(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateKennelUnitDto,
  ) {
    return this.kennelService.updateUnit(req.user.sub, id, dto);
  }

  @Put('units/:id/maintenance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set unit maintenance date' })
  @ApiParam({ name: 'id', description: 'Kennel unit ID' })
  setMaintenance(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SetMaintenanceDto,
  ) {
    return this.kennelService.setMaintenance(req.user.sub, id, dto.inMaintenanceUntil);
  }

  // ── Availability ────────────────────────────────────────────────────────────

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get per-date availability for a kennel (public)' })
  @ApiParam({ name: 'id', description: 'Kennel profile ID' })
  @ApiQuery({ name: 'startDate', description: 'Start date (ISO 8601)', required: true })
  @ApiQuery({ name: 'endDate', description: 'End date (ISO 8601)', required: true })
  getAvailability(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.kennelService.getAvailability(id, startDate, endDate);
  }

  // ── Stay Operations ─────────────────────────────────────────────────────────

  @Post(':id/intake')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perform pet intake (check-in)' })
  @ApiParam({ name: 'id', description: 'Kennel profile ID' })
  performIntake(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: PerformIntakeDto,
  ) {
    return this.kennelService.performIntake(req.user.sub, id, dto);
  }

  @Post(':stayId/daily-log')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a daily log entry for a kennel stay' })
  @ApiParam({ name: 'stayId', description: 'Kennel stay ID' })
  addDailyLog(
    @Request() req: any,
    @Param('stayId') stayId: string,
    @Body() dto: DailyLogDto,
  ) {
    return this.kennelService.addDailyLog(req.user.sub, stayId, dto);
  }

  @Post(':stayId/discharge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Discharge a pet from kennel stay' })
  @ApiParam({ name: 'stayId', description: 'Kennel stay ID' })
  discharge(
    @Request() req: any,
    @Param('stayId') stayId: string,
    @Body() dto: DischargeDto,
  ) {
    return this.kennelService.discharge(req.user.sub, stayId, dto);
  }

  @Post(':stayId/extend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request stay extension' })
  @ApiParam({ name: 'stayId', description: 'Kennel stay ID' })
  extendStay(
    @Request() req: any,
    @Param('stayId') stayId: string,
    @Body() dto: ExtendStayDto,
  ) {
    return this.kennelService.requestExtension(req.user.sub, stayId, dto);
  }

  @Post(':stayId/medical-hold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate medical hold for a kennel stay' })
  @ApiParam({ name: 'stayId', description: 'Kennel stay ID' })
  medicalHold(
    @Request() req: any,
    @Param('stayId') stayId: string,
    @Body() dto: MedicalHoldDto,
  ) {
    return this.kennelService.initiateMedicalHold(req.user.sub, stayId, dto);
  }
}
