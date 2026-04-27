import {
  Controller,
  Post,
  Patch,
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
import { PetHotelService } from './pethotel.service';
import {
  ApplyPetHotelDto,
  UpdatePetHotelProfileDto,
  CreateRoomTypeDto,
  UpdateRoomTypeDto,
  CreateRoomDto,
  UpdateRoomDto,
  CreatePackageDto,
  UpdatePackageDto,
  PayBalanceDto,
  PerformIntakeDto,
  DailyLogDto,
  DischargeDto,
  ExtendStayDto,
  MedicalHoldDto,
  AddServiceDto,
} from './pethotel.dto';

@ApiTags('pethotel')
@Controller('pethotel')
export class PetHotelController {
  constructor(private readonly petHotelService: PetHotelService) {}

  // ── Profile ─────────────────────────────────────────────────────────────────

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to register a pet hotel profile' })
  apply(@Request() req: any, @Body() dto: ApplyPetHotelDto) {
    return this.petHotelService.applyForPetHotel(req.user.sub, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pet hotel profile' })
  updateProfile(@Request() req: any, @Body() dto: UpdatePetHotelProfileDto) {
    return this.petHotelService.updateProfile(req.user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user pet hotel profile' })
  getMyProfile(@Request() req: any) {
    return this.petHotelService.getMyProfile(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pet hotel public profile' })
  @ApiParam({ name: 'id', description: 'PetHotel profile ID' })
  getPublicProfile(@Param('id') id: string) {
    return this.petHotelService.getPublicProfile(id);
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Search pet hotels' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'checkIn', required: false })
  @ApiQuery({ name: 'checkOut', required: false })
  @ApiQuery({ name: 'tier', required: false })
  @ApiQuery({ name: 'page', required: false })
  searchPetHotels(
    @Query('city') city?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('tier') tier?: string,
    @Query('page') page?: string,
  ) {
    return this.petHotelService.searchPetHotels({ city, checkIn, checkOut, tier, page: page ? parseInt(page, 10) : 1 });
  }

  // ── Room Types ──────────────────────────────────────────────────────────────

  @Post(':id/room-types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a room type' })
  createRoomType(@Request() req: any, @Param('id') id: string, @Body() dto: CreateRoomTypeDto) {
    return this.petHotelService.createRoomType(req.user.sub, id, dto);
  }

  @Patch('room-types/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a room type' })
  updateRoomType(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateRoomTypeDto) {
    return this.petHotelService.updateRoomType(req.user.sub, id, dto);
  }

  // ── Rooms ───────────────────────────────────────────────────────────────────

  @Post(':id/rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a room' })
  createRoom(@Request() req: any, @Param('id') id: string, @Body() dto: CreateRoomDto) {
    return this.petHotelService.createRoom(req.user.sub, id, dto);
  }

  @Patch('rooms/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a room' })
  updateRoom(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.petHotelService.updateRoom(req.user.sub, id, dto);
  }

  // ── Packages ────────────────────────────────────────────────────────────────

  @Post(':id/packages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a package' })
  createPackage(@Request() req: any, @Param('id') id: string, @Body() dto: CreatePackageDto) {
    return this.petHotelService.createPackage(req.user.sub, id, dto);
  }

  @Patch('packages/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a package' })
  updatePackage(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.petHotelService.updatePackage(req.user.sub, id, dto);
  }

  // ── Availability ────────────────────────────────────────────────────────────

  @Get(':id/availability')
  @ApiOperation({ summary: 'Check room availability' })
  @ApiQuery({ name: 'checkIn', required: true })
  @ApiQuery({ name: 'checkOut', required: true })
  @ApiQuery({ name: 'tier', required: false })
  getAvailability(
    @Param('id') id: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('tier') tier?: string,
  ) {
    return this.petHotelService.getAvailability(id, checkIn, checkOut, tier);
  }

  // ── Stay Operations ─────────────────────────────────────────────────────────

  @Post(':stayId/pay-balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pay balance for a stay' })
  payBalance(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: PayBalanceDto) {
    return this.petHotelService.payBalance(req.user.sub, stayId, dto);
  }

  @Post(':stayId/intake')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perform pet intake' })
  performIntake(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: PerformIntakeDto) {
    return this.petHotelService.performIntake(req.user.sub, stayId, dto);
  }

  @Post(':stayId/daily-log')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add daily log' })
  addDailyLog(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: DailyLogDto) {
    return this.petHotelService.addDailyLog(req.user.sub, stayId, dto);
  }

  @Post(':stayId/discharge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Discharge pet' })
  discharge(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: DischargeDto) {
    return this.petHotelService.discharge(req.user.sub, stayId, dto);
  }

  @Post(':stayId/extend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request stay extension' })
  extendStay(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: ExtendStayDto) {
    return this.petHotelService.requestExtension(req.user.sub, stayId, dto);
  }

  @Post(':stayId/medical-hold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate medical hold' })
  medicalHold(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: MedicalHoldDto) {
    return this.petHotelService.initiateMedicalHold(req.user.sub, stayId, dto);
  }

  @Post(':stayId/add-service')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add in-stay service' })
  addService(@Request() req: any, @Param('stayId') stayId: string, @Body() dto: AddServiceDto) {
    return this.petHotelService.addService(req.user.sub, stayId, dto);
  }
}
