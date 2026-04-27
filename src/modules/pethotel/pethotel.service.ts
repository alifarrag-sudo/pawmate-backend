import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { DepositService } from './deposit.service';
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

@Injectable()
export class PetHotelService {
  private readonly logger = new Logger(PetHotelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly depositService: DepositService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async assertHotelOwnerOrManager(userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        status: { not: 'REMOVED' },
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        business: {
          include: { petHotelProfile: true },
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Only business owner or manager can perform this action');
    }

    return {
      member,
      business: member.business,
      petHotelProfile: member.business.petHotelProfile,
    };
  }

  async assertHotelTeamMember(userId: string, petHotelProfileId: string) {
    const hotel = await this.prisma.petHotelProfile.findUnique({
      where: { id: petHotelProfileId },
      select: { businessProfileId: true },
    });
    if (!hotel) throw new NotFoundException('Pet hotel profile not found');

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: hotel.businessProfileId,
          userId,
        },
      },
    });

    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException('You are not an active team member of this hotel');
    }

    return member;
  }

  private async checkAutoApproval(petHotelProfileId: string): Promise<boolean> {
    const hotel = await this.prisma.petHotelProfile.findUnique({
      where: { id: petHotelProfileId },
      include: {
        _count: { select: { roomTypes: true, rooms: true } },
      },
    });
    if (!hotel) return false;

    return !!(
      hotel._count.roomTypes >= 1 &&
      hotel._count.rooms >= 1 &&
      hotel.liabilityWaiverText
    );
  }

  // ── Profile Management ─────────────────────────────────────────────────────

  async applyForPetHotel(userId: string, dto: ApplyPetHotelDto) {
    const { business } = await this.assertHotelOwnerOrManager(userId);

    if (business.businessType !== 'PET_HOTEL') {
      throw new BadRequestException('Business type must be PET_HOTEL');
    }

    const existing = await this.prisma.petHotelProfile.findUnique({
      where: { businessProfileId: business.id },
    });
    if (existing) {
      throw new ConflictException('This business already has a pet hotel profile');
    }

    const profile = await this.prisma.petHotelProfile.create({
      data: {
        businessProfileId: business.id,
        hotelName: dto.hotelName,
        starRating: dto.starRating,
        acceptsDogs: dto.acceptsDogs ?? true,
        acceptsCats: dto.acceptsCats ?? false,
        acceptsOther: dto.acceptsOther ?? false,
        maxPetsPerRoom: dto.maxPetsPerRoom ?? 1,
        hasPool: dto.hasPool ?? false,
        hasGroomingSpa: dto.hasGroomingSpa ?? false,
        hasOnCallVet: dto.hasOnCallVet ?? false,
        hasTrainingProgram: dto.hasTrainingProgram ?? false,
        hasLiveCameraAccess: dto.hasLiveCameraAccess ?? false,
        hasPickupDropoffService: dto.hasPickupDropoffService ?? false,
        pickupRadiusKm: dto.pickupRadiusKm,
        pickupCostEgp: dto.pickupCostEgp,
        checkInWindowJson: dto.checkInWindowJson,
        checkOutWindowJson: dto.checkOutWindowJson,
        requiresVaccinationProof: dto.requiresVaccinationProof ?? true,
        requiredVaccines: dto.requiredVaccines ?? ['rabies', 'DHPP'],
        requiresDeposit: dto.requiresDeposit ?? true,
        depositPercentage: dto.depositPercentage ?? 25,
        depositRefundWindowHours: dto.depositRefundWindowHours ?? 72,
        liabilityWaiverText: dto.liabilityWaiverText,
        status: 'PENDING_DOCS',
      },
    });

    this.events.emit('pethotel.applied', {
      petHotelProfileId: profile.id,
      businessId: business.id,
      userId,
    });

    return profile;
  }

  async updateProfile(userId: string, dto: UpdatePetHotelProfileDto) {
    const { petHotelProfile } = await this.assertHotelOwnerOrManager(userId);
    if (!petHotelProfile) throw new NotFoundException('Pet hotel profile not found');

    const updateData: any = {};
    const fields = [
      'hotelName', 'starRating', 'acceptsDogs', 'acceptsCats', 'acceptsOther',
      'maxPetsPerRoom', 'hasPool', 'hasGroomingSpa', 'hasOnCallVet',
      'hasTrainingProgram', 'hasLiveCameraAccess', 'hasPickupDropoffService',
      'pickupRadiusKm', 'pickupCostEgp', 'checkInWindowJson', 'checkOutWindowJson',
      'requiresVaccinationProof', 'requiredVaccines', 'requiresDeposit',
      'depositPercentage', 'depositRefundWindowHours',
    ];

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.liabilityWaiverText !== undefined) {
      updateData.liabilityWaiverText = dto.liabilityWaiverText;
      updateData.liabilityWaiverVersion = petHotelProfile.liabilityWaiverVersion + 1;
    }

    const updated = await this.prisma.petHotelProfile.update({
      where: { id: petHotelProfile.id },
      data: updateData,
    });

    if (updated.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(updated.id);
      if (canApprove) {
        const approved = await this.prisma.petHotelProfile.update({
          where: { id: updated.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('pethotel.auto_approved', {
          petHotelProfileId: approved.id,
          userId,
        });
        return approved;
      }
    }

    return updated;
  }

  async getMyProfile(userId: string) {
    const { petHotelProfile } = await this.assertHotelOwnerOrManager(userId);
    if (!petHotelProfile) throw new NotFoundException('Pet hotel profile not found');

    return this.prisma.petHotelProfile.findUnique({
      where: { id: petHotelProfile.id },
      include: {
        roomTypes: true,
        rooms: { include: { roomType: true } },
        packages: true,
        businessProfile: { select: { businessName: true, primaryCity: true, primaryAddress: true, photosUrls: true } },
      },
    });
  }

  async getPublicProfile(id: string) {
    const profile = await this.prisma.petHotelProfile.findUnique({
      where: { id },
      include: {
        roomTypes: { where: { isActive: true } },
        packages: { where: { isActive: true } },
        rooms: { where: { isActive: true }, select: { id: true, roomNumber: true, roomTypeId: true, floor: true } },
        businessProfile: {
          select: {
            businessName: true, primaryCity: true, primaryAddress: true,
            photosUrls: true, averageRating: true, totalBookings: true,
            businessEmail: true, businessPhone: true,
          },
        },
      },
    });

    if (!profile || profile.status !== 'APPROVED') {
      throw new NotFoundException('Pet hotel not found');
    }

    return profile;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async searchPetHotels(filters: { city?: string; checkIn?: string; checkOut?: string; tier?: string; page: number }) {
    const pageSize = 12;
    const skip = (filters.page - 1) * pageSize;

    const where: any = {
      status: 'APPROVED',
      businessProfile: {},
    };

    if (filters.city) {
      where.businessProfile.primaryCity = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters.tier) {
      where.roomTypes = { some: { tier: filters.tier as any, isActive: true } };
    }

    const [hotels, total] = await Promise.all([
      this.prisma.petHotelProfile.findMany({
        where,
        include: {
          roomTypes: { where: { isActive: true }, orderBy: { pricePerNightEgp: 'asc' } },
          businessProfile: {
            select: {
              businessName: true, primaryCity: true, primaryAddress: true,
              photosUrls: true, averageRating: true, totalBookings: true,
            },
          },
          _count: { select: { rooms: { where: { isActive: true } } } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.petHotelProfile.count({ where }),
    ]);

    return {
      data: hotels,
      total,
      page: filters.page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Room Types ──────────────────────────────────────────────────────────────

  async createRoomType(userId: string, hotelId: string, dto: CreateRoomTypeDto) {
    await this.assertHotelTeamMember(userId, hotelId);

    const roomType = await this.prisma.petHotelRoomType.create({
      data: {
        petHotelProfileId: hotelId,
        name: dto.name,
        tier: dto.tier as any,
        description: dto.description,
        squareMeters: dto.squareMeters,
        maxPetWeightKg: dto.maxPetWeightKg,
        suitableSizes: dto.suitableSizes ?? ['SMALL', 'MEDIUM', 'LARGE'],
        amenities: dto.amenities ?? [],
        pricePerNightEgp: dto.pricePerNightEgp,
        longStayNights: dto.longStayNights ?? 7,
        longStayPricePerNightEgp: dto.longStayPricePerNightEgp,
        photosUrls: dto.photosUrls ?? [],
      },
    });

    // Check auto-approval
    const hotel = await this.prisma.petHotelProfile.findUnique({ where: { id: hotelId } });
    if (hotel && hotel.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(hotelId);
      if (canApprove) {
        await this.prisma.petHotelProfile.update({
          where: { id: hotelId },
          data: { status: 'APPROVED' },
        });
        this.events.emit('pethotel.auto_approved', { petHotelProfileId: hotelId, userId });
      }
    }

    return roomType;
  }

  async updateRoomType(userId: string, roomTypeId: string, dto: UpdateRoomTypeDto) {
    const roomType = await this.prisma.petHotelRoomType.findUnique({
      where: { id: roomTypeId },
    });
    if (!roomType) throw new NotFoundException('Room type not found');

    await this.assertHotelTeamMember(userId, roomType.petHotelProfileId);

    return this.prisma.petHotelRoomType.update({
      where: { id: roomTypeId },
      data: {
        name: dto.name,
        tier: dto.tier as any,
        description: dto.description,
        squareMeters: dto.squareMeters,
        maxPetWeightKg: dto.maxPetWeightKg,
        suitableSizes: dto.suitableSizes,
        amenities: dto.amenities,
        pricePerNightEgp: dto.pricePerNightEgp,
        longStayNights: dto.longStayNights,
        longStayPricePerNightEgp: dto.longStayPricePerNightEgp,
        photosUrls: dto.photosUrls,
      },
    });
  }

  // ── Rooms ───────────────────────────────────────────────────────────────────

  async createRoom(userId: string, hotelId: string, dto: CreateRoomDto) {
    await this.assertHotelTeamMember(userId, hotelId);

    const existingRoom = await this.prisma.petHotelRoom.findUnique({
      where: {
        petHotelProfileId_roomNumber: {
          petHotelProfileId: hotelId,
          roomNumber: dto.roomNumber,
        },
      },
    });
    if (existingRoom) {
      throw new ConflictException(`Room "${dto.roomNumber}" already exists`);
    }

    const room = await this.prisma.petHotelRoom.create({
      data: {
        petHotelProfileId: hotelId,
        roomTypeId: dto.roomTypeId,
        roomNumber: dto.roomNumber,
        floor: dto.floor,
        cameraStreamUrl: dto.cameraStreamUrl,
        notes: dto.notes,
      },
    });

    // Check auto-approval
    const hotel = await this.prisma.petHotelProfile.findUnique({ where: { id: hotelId } });
    if (hotel && hotel.status === 'PENDING_DOCS') {
      const canApprove = await this.checkAutoApproval(hotelId);
      if (canApprove) {
        await this.prisma.petHotelProfile.update({
          where: { id: hotelId },
          data: { status: 'APPROVED' },
        });
        this.events.emit('pethotel.auto_approved', { petHotelProfileId: hotelId, userId });
      }
    }

    return room;
  }

  async updateRoom(userId: string, roomId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.petHotelRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    await this.assertHotelTeamMember(userId, room.petHotelProfileId);

    return this.prisma.petHotelRoom.update({
      where: { id: roomId },
      data: {
        roomTypeId: dto.roomTypeId,
        floor: dto.floor,
        cameraStreamUrl: dto.cameraStreamUrl,
        notes: dto.notes,
        isActive: dto.isActive,
        inMaintenanceUntil: dto.inMaintenanceUntil ? new Date(dto.inMaintenanceUntil) : undefined,
      },
    });
  }

  // ── Packages ────────────────────────────────────────────────────────────────

  async createPackage(userId: string, hotelId: string, dto: CreatePackageDto) {
    await this.assertHotelTeamMember(userId, hotelId);

    return this.prisma.petHotelPackage.create({
      data: {
        petHotelProfileId: hotelId,
        name: dto.name,
        description: dto.description,
        durationNights: dto.durationNights,
        eligibleRoomTiers: dto.eligibleRoomTiers as any[],
        includesGrooming: dto.includesGrooming ?? false,
        groomingSessionsCount: dto.groomingSessionsCount ?? 0,
        includesTraining: dto.includesTraining ?? false,
        trainingSessionsCount: dto.trainingSessionsCount ?? 0,
        includesVetCheckup: dto.includesVetCheckup ?? false,
        includesPhotoshoot: dto.includesPhotoshoot ?? false,
        includesTransport: dto.includesTransport ?? false,
        totalPriceEgp: dto.totalPriceEgp,
        savingsVsAlaCarte: dto.savingsVsAlaCarte,
      },
    });
  }

  async updatePackage(userId: string, packageId: string, dto: UpdatePackageDto) {
    const pkg = await this.prisma.petHotelPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    await this.assertHotelTeamMember(userId, pkg.petHotelProfileId);

    return this.prisma.petHotelPackage.update({
      where: { id: packageId },
      data: {
        name: dto.name,
        description: dto.description,
        durationNights: dto.durationNights,
        eligibleRoomTiers: dto.eligibleRoomTiers as any[],
        includesGrooming: dto.includesGrooming,
        groomingSessionsCount: dto.groomingSessionsCount,
        includesTraining: dto.includesTraining,
        trainingSessionsCount: dto.trainingSessionsCount,
        includesVetCheckup: dto.includesVetCheckup,
        includesPhotoshoot: dto.includesPhotoshoot,
        includesTransport: dto.includesTransport,
        totalPriceEgp: dto.totalPriceEgp,
        savingsVsAlaCarte: dto.savingsVsAlaCarte,
      },
    });
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async getAvailability(hotelId: string, checkIn: string, checkOut: string, tier?: string) {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const roomTypesWhere: any = { petHotelProfileId: hotelId, isActive: true };
    if (tier) roomTypesWhere.tier = tier as any;

    const roomTypes = await this.prisma.petHotelRoomType.findMany({
      where: roomTypesWhere,
      include: {
        rooms: {
          where: {
            isActive: true,
            OR: [
              { inMaintenanceUntil: null },
              { inMaintenanceUntil: { lt: checkInDate } },
            ],
          },
        },
      },
    });

    const overlappingStays = await this.prisma.petHotelStay.findMany({
      where: {
        petHotelProfileId: hotelId,
        status: { in: ['DEPOSIT_PAID', 'BALANCE_DUE', 'IN_STAY', 'READY_FOR_CHECKOUT', 'MEDICAL_HOLD'] },
        checkInDate: { lt: checkOutDate },
        checkOutDate: { gt: checkInDate },
      },
      select: { petHotelRoomId: true },
    });

    const occupiedRoomIds = new Set(overlappingStays.map(s => s.petHotelRoomId).filter(Boolean));

    return roomTypes.map(rt => ({
      roomTypeId: rt.id,
      name: rt.name,
      tier: rt.tier,
      pricePerNightEgp: rt.pricePerNightEgp,
      longStayPricePerNightEgp: rt.longStayPricePerNightEgp,
      amenities: rt.amenities,
      totalRooms: rt.rooms.length,
      availableRooms: rt.rooms.filter(r => !occupiedRoomIds.has(r.id)).length,
    }));
  }

  // ── Stay Operations ─────────────────────────────────────────────────────────

  async payBalance(userId: string, stayId: string, dto: PayBalanceDto) {
    const stay = await this.prisma.petHotelStay.findUnique({
      where: { id: stayId },
      include: { booking: true },
    });
    if (!stay) throw new NotFoundException('Stay not found');
    if (stay.booking.parentId !== userId) throw new ForbiddenException('Not your booking');
    if (stay.status !== 'DEPOSIT_PAID' && stay.status !== 'BALANCE_DUE') {
      throw new BadRequestException('Balance already paid or stay not in correct state');
    }

    const updated = await this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: {
        balancePaidAt: new Date(),
        status: 'BALANCE_DUE',
      },
    });

    this.events.emit('pethotel.balance_paid', { stayId, userId });

    return updated;
  }

  async performIntake(userId: string, stayId: string, dto: PerformIntakeDto) {
    const stay = await this.prisma.petHotelStay.findUnique({
      where: { id: stayId },
      include: { petHotelRoom: true, petHotelProfile: true },
    });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'DEPOSIT_PAID' && stay.status !== 'BALANCE_DUE') {
      throw new BadRequestException('Stay not ready for intake');
    }

    const cameraStreamUrl = stay.petHotelRoom?.cameraStreamUrl || null;

    const updated = await this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: {
        actualCheckInAt: new Date(),
        intakePhotos: dto.intakePhotos ?? [],
        intakeWeight: dto.intakeWeight,
        intakeNotes: dto.intakeNotes,
        vaccinationDocsUrls: dto.vaccinationDocsUrls ?? [],
        liabilityWaiverSignedAt: dto.liabilityWaiverSignatureUrl ? new Date() : undefined,
        liabilityWaiverVersion: stay.petHotelProfile.liabilityWaiverVersion,
        liabilityWaiverSignatureUrl: dto.liabilityWaiverSignatureUrl,
        liveCameraEnabled: !!cameraStreamUrl,
        cameraStreamUrl,
        status: 'IN_STAY',
      },
    });

    this.events.emit('pethotel.pet_checked_in', { stayId, userId });

    return updated;
  }

  async addDailyLog(userId: string, stayId: string, dto: DailyLogDto) {
    const stay = await this.prisma.petHotelStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException('Stay must be in IN_STAY status');
    }

    const existingLogs = (stay.dailyUpdatesJson as any[]) ?? [];
    existingLogs.push({
      date: dto.date,
      mood: dto.mood,
      appetite: dto.appetite,
      exerciseMinutes: dto.exerciseMinutes,
      notes: dto.notes,
      photoUrls: dto.photoUrls ?? [],
      loggedBy: userId,
      loggedAt: new Date().toISOString(),
    });

    return this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: { dailyUpdatesJson: existingLogs },
    });
  }

  async discharge(userId: string, stayId: string, dto: DischargeDto) {
    const stay = await this.prisma.petHotelStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'IN_STAY' && stay.status !== 'READY_FOR_CHECKOUT') {
      throw new BadRequestException('Stay not ready for discharge');
    }

    const updated = await this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: {
        actualCheckOutAt: new Date(),
        dischargePhotos: dto.dischargePhotos ?? [],
        dischargeWeight: dto.dischargeWeight,
        dischargeNotes: dto.dischargeNotes,
        liveCameraEnabled: false,
        cameraStreamUrl: null,
        status: 'CHECKED_OUT',
      },
    });

    this.events.emit('pethotel.pet_checked_out', { stayId, userId });

    return updated;
  }

  async requestExtension(userId: string, stayId: string, dto: ExtendStayDto) {
    const stay = await this.prisma.petHotelStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException('Can only extend an active stay');
    }

    // For now, just update the check-out date (parent approval via notification in future)
    return this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: {
        checkOutDate: new Date(dto.newCheckOutDate),
      },
    });
  }

  async initiateMedicalHold(userId: string, stayId: string, dto: MedicalHoldDto) {
    const stay = await this.prisma.petHotelStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException('Can only place medical hold on an active stay');
    }

    const updated = await this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: { status: 'MEDICAL_HOLD' },
    });

    this.events.emit('pethotel.medical_hold_initiated', {
      stayId,
      userId,
      reason: dto.reason,
    });

    return updated;
  }

  async addService(userId: string, stayId: string, dto: AddServiceDto) {
    const stay = await this.prisma.petHotelStay.findUnique({ where: { id: stayId } });
    if (!stay) throw new NotFoundException('Stay not found');

    await this.assertHotelTeamMember(userId, stay.petHotelProfileId);

    if (stay.status !== 'IN_STAY') {
      throw new BadRequestException('Can only add services during an active stay');
    }

    const updateData: any = {};
    switch (dto.type) {
      case 'grooming':
        updateData.groomingSessionsDone = stay.groomingSessionsDone + 1;
        break;
      case 'training':
        updateData.trainingSessionsDone = stay.trainingSessionsDone + 1;
        break;
      case 'vet_checkup':
        updateData.vetCheckupDone = true;
        break;
    }

    return this.prisma.petHotelStay.update({
      where: { id: stayId },
      data: updateData,
    });
  }
}
