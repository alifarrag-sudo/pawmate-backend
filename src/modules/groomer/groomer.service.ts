import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplyGroomerDto,
  UpdateGroomerProfileDto,
  CreateServiceDto,
  UpdateServiceDto,
  StartAppointmentDto,
  CompleteAppointmentDto,
  UploadPhotosDto,
  UpdateAllergyNotesDto,
} from './groomer.dto';

@Injectable()
export class GroomerService {
  private readonly logger = new Logger(GroomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Asserts the user is the OWNER or MANAGER of the business that owns the groomer profile.
   * Returns the BusinessProfile with its groomerProfile.
   */
  async assertGroomerOwnerOrManager(userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        status: { not: 'REMOVED' },
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        business: {
          include: { groomerProfile: true },
        },
      },
    });

    if (!member) {
      throw new ForbiddenException(
        'Only the business owner or manager can perform this action',
      );
    }

    return {
      member,
      business: member.business,
      groomerProfile: member.business.groomerProfile,
    };
  }

  /**
   * Asserts the user is any active team member of the business that owns the groomer profile.
   */
  async assertGroomerTeamMember(userId: string, groomerProfileId: string) {
    const groomer = await this.prisma.groomerProfile.findUnique({
      where: { id: groomerProfileId },
      select: { businessProfileId: true },
    });
    if (!groomer) {
      throw new NotFoundException('Groomer profile not found');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: {
        businessId_userId: {
          businessId: groomer.businessProfileId,
          userId,
        },
      },
    });

    if (!member || member.status === 'REMOVED') {
      throw new ForbiddenException(
        'You are not an active team member of this grooming business',
      );
    }

    return member;
  }

  /**
   * Auto-approval criteria:
   * - hasSalon or hasMobileVan is true
   * - At least one active service exists
   * - Bio is provided
   */
  private meetsAutoApprovalCriteria(profile: {
    hasSalon: boolean;
    hasMobileVan: boolean;
    bio?: string | null;
  }, serviceCount: number): boolean {
    const hasMode = profile.hasSalon || profile.hasMobileVan;
    const hasServices = serviceCount >= 1;
    const hasBio = !!profile.bio;

    return hasMode && hasServices && hasBio;
  }

  /**
   * Calculate the price for a pet based on weight, falling back through size brackets.
   */
  getPriceForPetSize(
    service: {
      priceFlat: number | null;
      priceSmallEgp: number | null;
      priceMediumEgp: number | null;
      priceLargeEgp: number | null;
      priceXLEgp: number | null;
    },
    petWeightKg: number | null,
  ): number {
    if (service.priceFlat) return service.priceFlat;
    const weight = petWeightKg ?? 15; // default medium
    if (weight <= 10) return service.priceSmallEgp ?? service.priceMediumEgp ?? 0;
    if (weight <= 25) return service.priceMediumEgp ?? 0;
    if (weight <= 45) return service.priceLargeEgp ?? service.priceMediumEgp ?? 0;
    return service.priceXLEgp ?? service.priceLargeEgp ?? 0;
  }

  // ── Profile Management ─────────────────────────────────────────────────────

  async applyForGroomer(userId: string, dto: ApplyGroomerDto) {
    const { business } = await this.assertGroomerOwnerOrManager(userId);

    if (business.businessType !== 'GROOMING_SALON') {
      throw new BadRequestException(
        'Business type must be GROOMING_SALON to apply for a groomer profile',
      );
    }

    const existing = await this.prisma.groomerProfile.findUnique({
      where: { businessProfileId: business.id },
    });
    if (existing) {
      throw new ConflictException('This business already has a groomer profile');
    }

    const hasSalon = dto.hasSalon ?? true;
    const hasMobileVan = dto.hasMobileVan ?? false;

    if (!hasSalon && !hasMobileVan) {
      throw new BadRequestException(
        'At least one service mode is required: hasSalon or hasMobileVan',
      );
    }

    // Create groomer profile + services in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const groomerProfile = await tx.groomerProfile.create({
        data: {
          businessProfileId: business.id,
          hasSalon,
          salonAddress: dto.salonAddress,
          salonLat: dto.salonLat,
          salonLng: dto.salonLng,
          hasMobileVan,
          mobileVanRadiusKm: dto.mobileVanRadiusKm,
          mobileVanCostEgp: dto.mobileVanCostEgp,
          freeVanAboveEgp: dto.freeVanAboveEgp,
          experienceYears: dto.experienceYears,
          bio: dto.bio,
          acceptsDogs: dto.acceptsDogs ?? true,
          acceptsCats: dto.acceptsCats ?? false,
          acceptsOther: dto.acceptsOther ?? false,
          slotDurationMinutes: dto.slotDurationMinutes ?? 60,
          advanceBookingDays: dto.advanceBookingDays ?? 30,
          sameHourBooking: dto.sameHourBooking ?? false,
          cancellationWindowHours: dto.cancellationWindowHours ?? 24,
          portfolioPhotosUrls: dto.portfolioPhotosUrls ?? [],
          status: 'PENDING_DOCS',
        },
      });

      // Create services
      const services = await Promise.all(
        dto.services.map((svc) =>
          tx.groomerService.create({
            data: {
              groomerProfileId: groomerProfile.id,
              serviceType: svc.serviceType as any,
              name: svc.name,
              description: svc.description,
              durationMinutes: svc.durationMinutes,
              priceSmallEgp: svc.priceSmallEgp,
              priceMediumEgp: svc.priceMediumEgp,
              priceLargeEgp: svc.priceLargeEgp,
              priceXLEgp: svc.priceXLEgp,
              priceFlat: svc.priceFlat,
              mobileVanSurchargeEgp: svc.mobileVanSurchargeEgp,
            },
          }),
        ),
      );

      return { groomerProfile, services };
    });

    // Check auto-approval
    if (
      this.meetsAutoApprovalCriteria(result.groomerProfile, result.services.length)
    ) {
      const approved = await this.prisma.groomerProfile.update({
        where: { id: result.groomerProfile.id },
        data: { status: 'APPROVED' },
      });

      this.events.emit('groomer.auto_approved', {
        groomerProfileId: approved.id,
        businessId: business.id,
        userId,
      });

      return { ...approved, services: result.services };
    }

    this.events.emit('groomer.applied', {
      groomerProfileId: result.groomerProfile.id,
      businessId: business.id,
      userId,
    });

    return { ...result.groomerProfile, services: result.services };
  }

  async updateProfile(userId: string, dto: UpdateGroomerProfileDto) {
    const { groomerProfile } = await this.assertGroomerOwnerOrManager(userId);
    if (!groomerProfile) {
      throw new NotFoundException('Groomer profile not found');
    }

    const updateData: Record<string, any> = {};
    const scalarFields = [
      'hasSalon', 'salonAddress', 'salonLat', 'salonLng',
      'hasMobileVan', 'mobileVanRadiusKm', 'mobileVanCostEgp', 'freeVanAboveEgp',
      'experienceYears', 'bio',
      'acceptsDogs', 'acceptsCats', 'acceptsOther',
      'slotDurationMinutes', 'advanceBookingDays', 'sameHourBooking',
      'cancellationWindowHours',
    ];

    for (const field of scalarFields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    if (dto.portfolioPhotosUrls !== undefined) {
      updateData.portfolioPhotosUrls = dto.portfolioPhotosUrls;
    }

    const updated = await this.prisma.groomerProfile.update({
      where: { id: groomerProfile.id },
      data: updateData,
    });

    // Re-check auto-approval after update
    if (updated.status === 'PENDING_DOCS') {
      const serviceCount = await this.prisma.groomerService.count({
        where: { groomerProfileId: updated.id, isActive: true },
      });
      if (this.meetsAutoApprovalCriteria(updated, serviceCount)) {
        const approved = await this.prisma.groomerProfile.update({
          where: { id: updated.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('groomer.auto_approved', {
          groomerProfileId: approved.id,
          userId,
        });
        return approved;
      }
    }

    return updated;
  }

  async getMyProfile(userId: string) {
    const { groomerProfile } = await this.assertGroomerOwnerOrManager(userId);
    if (!groomerProfile) {
      throw new NotFoundException('Groomer profile not found');
    }

    return this.prisma.groomerProfile.findUnique({
      where: { id: groomerProfile.id },
      include: {
        services: { orderBy: { isPopular: 'desc' } },
        appointments: {
          orderBy: { appointmentAt: 'desc' },
          take: 20,
          select: {
            id: true,
            bookingId: true,
            serviceId: true,
            petId: true,
            mode: true,
            appointmentAt: true,
            estimatedDurationMin: true,
            actualDurationMin: true,
            status: true,
            createdAt: true,
          },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            primaryLat: true,
            primaryLng: true,
            photosUrls: true,
            averageRating: true,
            totalBookings: true,
          },
        },
      },
    });
  }

  async getPublicProfile(id: string) {
    const profile = await this.prisma.groomerProfile.findUnique({
      where: { id },
      select: {
        id: true,
        hasSalon: true,
        salonAddress: true,
        salonLat: true,
        salonLng: true,
        hasMobileVan: true,
        mobileVanRadiusKm: true,
        mobileVanCostEgp: true,
        freeVanAboveEgp: true,
        experienceYears: true,
        bio: true,
        acceptsDogs: true,
        acceptsCats: true,
        acceptsOther: true,
        slotDurationMinutes: true,
        advanceBookingDays: true,
        sameHourBooking: true,
        cancellationWindowHours: true,
        portfolioPhotosUrls: true,
        status: true,
        createdAt: true,
        services: {
          where: { isActive: true },
          select: {
            id: true,
            serviceType: true,
            name: true,
            description: true,
            durationMinutes: true,
            priceSmallEgp: true,
            priceMediumEgp: true,
            priceLargeEgp: true,
            priceXLEgp: true,
            priceFlat: true,
            mobileVanSurchargeEgp: true,
            isPopular: true,
          },
          orderBy: { isPopular: 'desc' },
        },
        _count: {
          select: { appointments: { where: { status: 'COMPLETED' } } },
        },
        businessProfile: {
          select: {
            businessName: true,
            primaryCity: true,
            primaryAddress: true,
            primaryLat: true,
            primaryLng: true,
            photosUrls: true,
            averageRating: true,
            totalBookings: true,
            businessEmail: true,
            businessPhone: true,
          },
        },
      },
    });

    if (!profile || profile.status !== 'APPROVED') {
      throw new NotFoundException('Groomer not found');
    }

    return profile;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async searchGroomers(filters: {
    city?: string;
    serviceType?: string;
    mobileVan?: boolean;
    acceptsDogs?: boolean;
    acceptsCats?: boolean;
    query?: string;
    page: number;
  }) {
    const pageSize = 12;
    const skip = (filters.page - 1) * pageSize;

    const where: any = {
      status: 'APPROVED',
      businessProfile: {},
    };

    if (filters.city) {
      where.businessProfile.primaryCity = {
        contains: filters.city,
        mode: 'insensitive',
      };
    }

    if (filters.serviceType) {
      where.services = {
        some: {
          serviceType: filters.serviceType as any,
          isActive: true,
        },
      };
    }

    if (filters.mobileVan) {
      where.hasMobileVan = true;
    }

    if (filters.acceptsDogs !== undefined) {
      where.acceptsDogs = filters.acceptsDogs;
    }

    if (filters.acceptsCats !== undefined) {
      where.acceptsCats = filters.acceptsCats;
    }

    if (filters.query) {
      where.OR = [
        { bio: { contains: filters.query, mode: 'insensitive' } },
        {
          businessProfile: {
            businessName: { contains: filters.query, mode: 'insensitive' },
          },
        },
      ];
    }

    const [groomers, total] = await Promise.all([
      this.prisma.groomerProfile.findMany({
        where,
        select: {
          id: true,
          hasSalon: true,
          hasMobileVan: true,
          mobileVanRadiusKm: true,
          mobileVanCostEgp: true,
          experienceYears: true,
          bio: true,
          acceptsDogs: true,
          acceptsCats: true,
          acceptsOther: true,
          portfolioPhotosUrls: true,
          status: true,
          services: {
            where: { isActive: true },
            select: {
              id: true,
              serviceType: true,
              name: true,
              priceSmallEgp: true,
              priceMediumEgp: true,
              priceLargeEgp: true,
              priceFlat: true,
              isPopular: true,
            },
            orderBy: { isPopular: 'desc' },
          },
          _count: {
            select: { appointments: { where: { status: 'COMPLETED' } } },
          },
          businessProfile: {
            select: {
              businessName: true,
              primaryCity: true,
              primaryAddress: true,
              primaryLat: true,
              primaryLng: true,
              photosUrls: true,
              averageRating: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.groomerProfile.count({ where }),
    ]);

    return {
      data: groomers,
      total,
      page: filters.page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Service Management ──────────────────────────────────────────────────────

  async createService(userId: string, dto: CreateServiceDto) {
    const { groomerProfile } = await this.assertGroomerOwnerOrManager(userId);
    if (!groomerProfile) {
      throw new NotFoundException('Groomer profile not found');
    }

    const service = await this.prisma.groomerService.create({
      data: {
        groomerProfileId: groomerProfile.id,
        serviceType: dto.serviceType as any,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        priceSmallEgp: dto.priceSmallEgp,
        priceMediumEgp: dto.priceMediumEgp,
        priceLargeEgp: dto.priceLargeEgp,
        priceXLEgp: dto.priceXLEgp,
        priceFlat: dto.priceFlat,
        mobileVanSurchargeEgp: dto.mobileVanSurchargeEgp,
        isPopular: dto.isPopular ?? false,
      },
    });

    // Re-check auto-approval (service was just created)
    if (groomerProfile.status === 'PENDING_DOCS') {
      const serviceCount = await this.prisma.groomerService.count({
        where: { groomerProfileId: groomerProfile.id, isActive: true },
      });
      if (this.meetsAutoApprovalCriteria(groomerProfile, serviceCount)) {
        const approved = await this.prisma.groomerProfile.update({
          where: { id: groomerProfile.id },
          data: { status: 'APPROVED' },
        });
        this.events.emit('groomer.auto_approved', {
          groomerProfileId: approved.id,
          userId,
        });
      }
    }

    return service;
  }

  async updateService(userId: string, serviceId: string, dto: UpdateServiceDto) {
    const { groomerProfile } = await this.assertGroomerOwnerOrManager(userId);
    if (!groomerProfile) {
      throw new NotFoundException('Groomer profile not found');
    }

    const service = await this.prisma.groomerService.findUnique({
      where: { id: serviceId },
    });
    if (!service || service.groomerProfileId !== groomerProfile.id) {
      throw new NotFoundException('Service not found in this groomer profile');
    }

    const updateData: Record<string, any> = {};
    const fields = [
      'name', 'description', 'durationMinutes',
      'priceSmallEgp', 'priceMediumEgp', 'priceLargeEgp', 'priceXLEgp',
      'priceFlat', 'mobileVanSurchargeEgp', 'isPopular', 'isActive',
    ];

    for (const field of fields) {
      if ((dto as any)[field] !== undefined) {
        updateData[field] = (dto as any)[field];
      }
    }

    return this.prisma.groomerService.update({
      where: { id: serviceId },
      data: updateData,
    });
  }

  async deleteService(userId: string, serviceId: string) {
    const { groomerProfile } = await this.assertGroomerOwnerOrManager(userId);
    if (!groomerProfile) {
      throw new NotFoundException('Groomer profile not found');
    }

    const service = await this.prisma.groomerService.findUnique({
      where: { id: serviceId },
    });
    if (!service || service.groomerProfileId !== groomerProfile.id) {
      throw new NotFoundException('Service not found in this groomer profile');
    }

    // Soft delete — mark as inactive
    return this.prisma.groomerService.update({
      where: { id: serviceId },
      data: { isActive: false },
    });
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async getAvailability(groomerId: string, dateStr: string) {
    const groomer = await this.prisma.groomerProfile.findUnique({
      where: { id: groomerId },
      select: {
        id: true,
        slotDurationMinutes: true,
        sameHourBooking: true,
        status: true,
      },
    });
    if (!groomer || groomer.status !== 'APPROVED') {
      throw new NotFoundException('Groomer not found');
    }

    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get existing appointments for the date
    const existingAppointments = await this.prisma.groomingAppointment.findMany({
      where: {
        groomerProfileId: groomerId,
        appointmentAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
      },
      select: {
        appointmentAt: true,
        estimatedDurationMin: true,
      },
      orderBy: { appointmentAt: 'asc' },
    });

    // Generate time slots (9 AM to 8 PM in Cairo time — adjust as needed)
    const slots: Array<{
      time: string;
      available: boolean;
    }> = [];

    const slotDuration = groomer.slotDurationMinutes;
    const workdayStart = 9; // 9 AM
    const workdayEnd = 20; // 8 PM
    const totalMinutes = (workdayEnd - workdayStart) * 60;

    for (let offset = 0; offset < totalMinutes; offset += slotDuration) {
      const slotStart = new Date(startOfDay);
      slotStart.setHours(workdayStart + Math.floor(offset / 60), offset % 60, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

      // Check if this slot overlaps with any existing appointment
      const isBooked = existingAppointments.some((appt) => {
        const apptEnd = new Date(appt.appointmentAt);
        apptEnd.setMinutes(apptEnd.getMinutes() + appt.estimatedDurationMin);
        return slotStart < apptEnd && slotEnd > appt.appointmentAt;
      });

      // Check if the slot is in the past
      const isPast = slotStart < new Date();

      slots.push({
        time: slotStart.toISOString(),
        available: !isBooked && !isPast,
      });
    }

    return {
      groomerId,
      date: dateStr,
      slotDurationMinutes: slotDuration,
      slots,
    };
  }

  // ── Appointment Operations ──────────────────────────────────────────────────

  async startAppointment(
    userId: string,
    appointmentId: string,
    dto: StartAppointmentDto,
  ) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
      include: { pet: true },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot start an appointment with status "${appointment.status}"`,
      );
    }

    const updated = await this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: {
        status: 'IN_PROGRESS',
        beforePhotosUrls: dto.beforePhotosUrls ?? [],
        allergyNotes: appointment.pet.groomingAllergyNotes ?? dto.notes ?? null,
        specialInstructions: dto.notes ?? appointment.specialInstructions,
      },
    });

    this.events.emit('grooming.started', {
      appointmentId: updated.id,
      groomerProfileId: appointment.groomerProfileId,
      bookingId: appointment.bookingId,
      petId: appointment.petId,
      userId,
    });

    return updated;
  }

  async completeAppointment(
    userId: string,
    appointmentId: string,
    dto: CompleteAppointmentDto,
  ) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
      include: { pet: true },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot complete an appointment with status "${appointment.status}"`,
      );
    }

    const reactionsObserved = dto.reactionsObserved ?? [];

    // Use a transaction to update both appointment and pet data atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.groomingAppointment.update({
        where: { id: appointmentId },
        data: {
          status: 'COMPLETED',
          afterPhotosUrls: dto.afterPhotosUrls ?? [],
          groomingNotes: dto.groomingNotes,
          reactionsObserved,
          actualDurationMin: dto.actualDurationMin,
        },
      });

      // Update pet with reactions if any were observed
      const petUpdateData: Record<string, any> = {
        lastGroomedAt: new Date(),
      };

      if (reactionsObserved.length > 0) {
        // Append to existing allergy notes
        const existingNotes = appointment.pet.groomingAllergyNotes ?? '';
        const datePrefix = new Date().toISOString().split('T')[0];
        const newNote = `[${datePrefix}] Reactions: ${reactionsObserved.join(', ')}`;
        petUpdateData.groomingAllergyNotes = existingNotes
          ? `${existingNotes}\n${newNote}`
          : newNote;
      }

      await tx.pet.update({
        where: { id: appointment.petId },
        data: petUpdateData,
      });

      return updatedAppointment;
    });

    this.events.emit('grooming.completed', {
      appointmentId: result.id,
      groomerProfileId: appointment.groomerProfileId,
      bookingId: appointment.bookingId,
      petId: appointment.petId,
      reactionsObserved,
      userId,
    });

    return result;
  }

  async cancelAppointment(userId: string, appointmentId: string) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot cancel an appointment with status "${appointment.status}"`,
      );
    }

    const updated = await this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
    });

    this.events.emit('grooming.cancelled', {
      appointmentId: updated.id,
      groomerProfileId: appointment.groomerProfileId,
      bookingId: appointment.bookingId,
      petId: appointment.petId,
      userId,
    });

    return updated;
  }

  async markNoShow(userId: string, appointmentId: string) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Can only mark no-show for CONFIRMED appointments, current status is "${appointment.status}"`,
      );
    }

    const updated = await this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: { status: 'NO_SHOW' },
    });

    this.events.emit('grooming.no_show', {
      appointmentId: updated.id,
      groomerProfileId: appointment.groomerProfileId,
      bookingId: appointment.bookingId,
      petId: appointment.petId,
      userId,
    });

    return updated;
  }

  // ── Photo Uploads ──────────────────────────────────────────────────────────

  async uploadBeforePhotos(
    userId: string,
    appointmentId: string,
    dto: UploadPhotosDto,
  ) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status !== 'CONFIRMED' && appointment.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Before photos can only be uploaded for CONFIRMED or IN_PROGRESS appointments',
      );
    }

    const mergedUrls = [...appointment.beforePhotosUrls, ...dto.urls];

    return this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: { beforePhotosUrls: mergedUrls },
    });
  }

  async uploadAfterPhotos(
    userId: string,
    appointmentId: string,
    dto: UploadPhotosDto,
  ) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    if (appointment.status !== 'IN_PROGRESS' && appointment.status !== 'COMPLETED') {
      throw new BadRequestException(
        'After photos can only be uploaded for IN_PROGRESS or COMPLETED appointments',
      );
    }

    const mergedUrls = [...appointment.afterPhotosUrls, ...dto.urls];

    return this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: { afterPhotosUrls: mergedUrls },
    });
  }

  // ── Share Token ─────────────────────────────────────────────────────────────

  async generateShareToken(userId: string, appointmentId: string) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
      include: { booking: true },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    // Only the pet parent (booking owner) or a groomer team member can share
    const isParent = appointment.booking.parentId === userId;
    if (!isParent) {
      await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);
    }

    if (appointment.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Can only share completed appointments',
      );
    }

    // Generate 16-character cryptographically random token
    const shareToken = randomBytes(8).toString('hex'); // 16 hex chars
    const shareTokenExpiresAt = new Date();
    shareTokenExpiresAt.setDate(shareTokenExpiresAt.getDate() + 90); // 90-day TTL

    const updated = await this.prisma.groomingAppointment.update({
      where: { id: appointmentId },
      data: {
        shareToken,
        shareTokenExpiresAt,
        sharedByParent: isParent,
      },
    });

    return {
      shareToken: updated.shareToken,
      shareTokenExpiresAt: updated.shareTokenExpiresAt,
      shareUrl: `/groomer/share/${updated.shareToken}`,
    };
  }

  async getPublicShare(shareToken: string) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { shareToken },
      include: {
        pet: {
          select: {
            name: true,
            species: true,
            breed: true,
            profilePhoto: true,
          },
        },
        groomerProfile: {
          select: {
            id: true,
            businessProfile: {
              select: {
                businessName: true,
                primaryCity: true,
                photosUrls: true,
              },
            },
          },
        },
        service: {
          select: {
            name: true,
            serviceType: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Share link not found');
    }

    if (
      appointment.shareTokenExpiresAt &&
      appointment.shareTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('Share link has expired');
    }

    // Return limited data only
    return {
      petFirstName: appointment.pet.name.split(' ')[0],
      petSpecies: appointment.pet.species,
      petBreed: appointment.pet.breed,
      petPhoto: appointment.pet.profilePhoto,
      groomerName: appointment.groomerProfile.businessProfile.businessName,
      groomerCity: appointment.groomerProfile.businessProfile.primaryCity,
      serviceName: appointment.service.name,
      serviceType: appointment.service.serviceType,
      appointmentAt: appointment.appointmentAt,
      beforePhotos: appointment.beforePhotosUrls,
      afterPhotos: appointment.afterPhotosUrls,
      groomingNotes: appointment.groomingNotes,
      completedAt: appointment.updatedAt,
    };
  }

  // ── Allergy Notes ──────────────────────────────────────────────────────────

  async updateAllergyNotes(
    userId: string,
    appointmentId: string,
    dto: UpdateAllergyNotesDto,
  ) {
    const appointment = await this.prisma.groomingAppointment.findUnique({
      where: { id: appointmentId },
      include: { pet: true },
    });
    if (!appointment) {
      throw new NotFoundException('Grooming appointment not found');
    }

    await this.assertGroomerTeamMember(userId, appointment.groomerProfileId);

    // Append to existing allergy notes (never overwrite)
    const existingNotes = appointment.pet.groomingAllergyNotes ?? '';
    const datePrefix = new Date().toISOString().split('T')[0];
    const newNote = `[${datePrefix}] ${dto.allergyNotes}`;
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${newNote}`
      : newNote;

    const updateData: Record<string, any> = {
      groomingAllergyNotes: updatedNotes,
    };

    if (dto.productsToAvoid && dto.productsToAvoid.length > 0) {
      // Merge with existing, deduplicate
      const existingProducts = appointment.pet.groomingProductsToAvoid ?? [];
      const merged = [...new Set([...existingProducts, ...dto.productsToAvoid])];
      updateData.groomingProductsToAvoid = merged;
    }

    return this.prisma.pet.update({
      where: { id: appointment.petId },
      data: updateData,
      select: {
        id: true,
        name: true,
        groomingAllergyNotes: true,
        groomingProductsToAvoid: true,
        lastGroomedAt: true,
      },
    });
  }
}
