import { Test, TestingModule } from '@nestjs/testing';
import { GroomerService } from './groomer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('GroomerService', () => {
  let service: GroomerService;
  let prisma: any;
  let events: any;

  const mockUserId = 'user-1';

  const mockGroomerService = {
    id: 'svc-1',
    groomerProfileId: 'groomer-1',
    serviceType: 'FULL_GROOM',
    name: 'Full Groom',
    durationMinutes: 90,
    priceSmallEgp: 200,
    priceMediumEgp: 300,
    priceLargeEgp: 400,
    priceXLEgp: 500,
    priceFlat: null,
    mobileVanSurchargeEgp: 50,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      groomerProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      groomerService: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      groomingAppointment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      pet: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroomerService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<GroomerService>(GroomerService);
  });

  // ── Price tier selection ───────────────────────────────────────────────────

  describe('getPriceForPetSize', () => {
    it('should return SMALL price for 8kg dog', () => {
      const price = service.getPriceForPetSize(mockGroomerService as any, 8);
      expect(price).toBe(200);
    });

    it('should return MEDIUM price for 20kg dog', () => {
      const price = service.getPriceForPetSize(mockGroomerService as any, 20);
      expect(price).toBe(300);
    });

    it('should return LARGE price for 35kg dog', () => {
      const price = service.getPriceForPetSize(mockGroomerService as any, 35);
      expect(price).toBe(400);
    });

    it('should return XL price for 50kg dog', () => {
      const price = service.getPriceForPetSize(mockGroomerService as any, 50);
      expect(price).toBe(500);
    });

    it('should default to MEDIUM when weight not provided', () => {
      const price = service.getPriceForPetSize(mockGroomerService as any, null);
      expect(price).toBe(300);
    });

    it('should use priceFlat when set (ignoring size)', () => {
      const flatService = { ...mockGroomerService, priceFlat: 150 };
      const price = service.getPriceForPetSize(flatService as any, 50);
      expect(price).toBe(150);
    });
  });

  // ── Mobile van pricing ─────────────────────────────────────────────────────

  describe('mobile van pricing', () => {
    it('should add mobileVanSurchargeEgp to base price', () => {
      const basePrice = service.getPriceForPetSize(mockGroomerService as any, 20);
      const totalWithVan = basePrice + (mockGroomerService.mobileVanSurchargeEgp ?? 0);
      expect(totalWithVan).toBe(350);
    });
  });

  // ── Share token generation ─────────────────────────────────────────────────

  describe('share token', () => {
    it('should generate unique tokens', () => {
      const { randomBytes } = require('crypto');
      const token1 = randomBytes(8).toString('hex');
      const token2 = randomBytes(8).toString('hex');
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(16);
    });

    it('should set 90-day TTL on share token', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const diffDays = Math.round(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(90);
    });
  });

  // ── Public share endpoint ──────────────────────────────────────────────────

  describe('getPublicShare', () => {
    it('should return correct fields with no parent PII', async () => {
      prisma.groomingAppointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        shareToken: 'abc123def456gh78',
        shareTokenExpiresAt: new Date(Date.now() + 86400000),
        beforePhotosUrls: ['https://cdn.test/before.jpg'],
        afterPhotosUrls: ['https://cdn.test/after.jpg'],
        groomingNotes: 'All good',
        appointmentAt: new Date('2026-05-01T10:00:00Z'),
        updatedAt: new Date('2026-05-01T11:00:00Z'),
        status: 'COMPLETED',
        pet: {
          name: 'Buddy Smith',
          species: 'dog',
          breed: 'Labrador',
          profilePhoto: 'https://cdn.test/buddy.jpg',
        },
        service: { name: 'Full Groom', serviceType: 'FULL_GROOM' },
        groomerProfile: {
          id: 'groomer-1',
          businessProfile: {
            businessName: 'Cairo Grooming',
            primaryCity: 'Cairo',
            photosUrls: [],
          },
        },
      });

      const result = await service.getPublicShare('abc123def456gh78');

      expect(result.petFirstName).toBe('Buddy');
      expect(result.groomerName).toBe('Cairo Grooming');
      expect(result.serviceName).toBe('Full Groom');
      expect(result.beforePhotos).toEqual(['https://cdn.test/before.jpg']);
      expect(result.afterPhotos).toEqual(['https://cdn.test/after.jpg']);
      // Must NOT contain parent PII
      expect(result).not.toHaveProperty('parentName');
      expect(result).not.toHaveProperty('parentEmail');
      expect(result).not.toHaveProperty('parentPhone');
      expect(result).not.toHaveProperty('address');
    });

    it('should throw BadRequestException for expired share token', async () => {
      prisma.groomingAppointment.findUnique.mockResolvedValue({
        id: 'apt-1',
        shareToken: 'expired_token_xx',
        shareTokenExpiresAt: new Date(Date.now() - 86400000),
        pet: { name: 'Buddy', species: 'dog', breed: null, profilePhoto: null },
        service: { name: 'Full Groom', serviceType: 'FULL_GROOM' },
        groomerProfile: {
          id: 'g-1',
          businessProfile: { businessName: 'Test', primaryCity: 'Cairo', photosUrls: [] },
        },
      });

      await expect(
        service.getPublicShare('expired_token_xx'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 404 for non-existent share token', async () => {
      prisma.groomingAppointment.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublicShare('nonexistent12345'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Appointment completion updates Pet allergy notes ────────────────────────

  describe('completeAppointment', () => {
    it('should update Pet allergy notes when reactions observed', async () => {
      const mockAppointment = {
        id: 'apt-1',
        groomerProfileId: 'groomer-1',
        bookingId: 'bk-1',
        petId: 'pet-1',
        status: 'IN_PROGRESS',
        pet: {
          id: 'pet-1',
          groomingAllergyNotes: null,
          groomingProductsToAvoid: [],
        },
      };

      prisma.groomingAppointment.findUnique.mockResolvedValue(mockAppointment);
      prisma.groomerProfile.findUnique.mockResolvedValue({
        id: 'groomer-1',
        businessProfileId: 'biz-1',
      });
      prisma.teamMember.findUnique.mockResolvedValue({
        id: 'tm-1',
        businessId: 'biz-1',
        userId: mockUserId,
        status: 'ACTIVE',
      });
      prisma.groomingAppointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
        reactionsObserved: ['dry_skin', 'sensitive_to_product_X'],
      });
      prisma.pet.update.mockResolvedValue({});

      await service.completeAppointment(mockUserId, 'apt-1', {
        groomingNotes: 'Used gentle shampoo',
        reactionsObserved: ['dry_skin', 'sensitive_to_product_X'],
        afterPhotosUrls: ['https://cdn.test/after.jpg'],
        actualDurationMin: 75,
      });

      // Verify Pet was updated with lastGroomedAt and allergy notes
      expect(prisma.pet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pet-1' },
          data: expect.objectContaining({
            lastGroomedAt: expect.any(Date),
            groomingAllergyNotes: expect.stringContaining('dry_skin'),
          }),
        }),
      );

      expect(events.emit).toHaveBeenCalledWith(
        'grooming.completed',
        expect.any(Object),
      );
    });
  });

  // ── Availability returns correct slots ─────────────────────────────────────

  describe('getAvailability', () => {
    it('should return slots object for given date', async () => {
      prisma.groomerProfile.findUnique.mockResolvedValue({
        id: 'groomer-1',
        slotDurationMinutes: 60,
        sameHourBooking: false,
        status: 'APPROVED',
      });

      prisma.groomingAppointment.findMany.mockResolvedValue([
        {
          appointmentAt: new Date('2026-05-10T10:00:00Z'),
          estimatedDurationMin: 60,
        },
      ]);

      const result = await service.getAvailability('groomer-1', '2026-05-10');

      expect(result).toHaveProperty('groomerId', 'groomer-1');
      expect(result).toHaveProperty('date', '2026-05-10');
      expect(result).toHaveProperty('slotDurationMinutes', 60);
      expect(Array.isArray(result.slots)).toBe(true);
      expect(result.slots.length).toBeGreaterThan(0);
    });
  });
});
