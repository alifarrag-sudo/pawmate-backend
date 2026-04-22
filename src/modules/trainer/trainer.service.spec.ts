import { Test, TestingModule } from '@nestjs/testing';
import { TrainerService } from './trainer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from '../mail/mail.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  trainerProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  trainerPayout: { create: jest.fn() },
  user: { update: jest.fn(), findUnique: jest.fn() },
  pricingBounds: { findMany: jest.fn() },
  booking: { findUnique: jest.fn(), update: jest.fn() },
};

const mockUploads = {
  uploadImage: jest.fn().mockResolvedValue({ url: 'https://cdn.test/image.jpg', publicId: 'test123' }),
};

const mockMail = {
  sendTrainerRejection: jest.fn().mockResolvedValue(undefined),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('TrainerService', () => {
  let service: TrainerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UploadsService, useValue: mockUploads },
        { provide: MailService, useValue: mockMail },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<TrainerService>(TrainerService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Apply
  // ──────────────────────────────────────────────────────────────────────────

  describe('applyForTrainer', () => {
    it('should create a trainer profile and add TRAINER role', async () => {
      mockPrisma.trainerProfile.findUnique.mockResolvedValue(null);
      mockPrisma.trainerProfile.create.mockResolvedValue({
        id: 'tp1',
        userId: 'u1',
        status: 'PENDING_DOCS',
        appliedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.applyForTrainer('u1');

      expect(result.profileId).toBe('tp1');
      expect(result.status).toBe('PENDING_DOCS');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { roles: { push: 'TRAINER' } },
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'trainer.applied',
        expect.any(Object),
      );
    });

    it('should throw ConflictException if profile already exists', async () => {
      mockPrisma.trainerProfile.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.applyForTrainer('u1')).rejects.toThrow(ConflictException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Auto-approve with all fields
  // ──────────────────────────────────────────────────────────────────────────

  describe('updateProfile — auto-approval', () => {
    const fullProfile = {
      id: 'tp1',
      userId: 'u1',
      status: 'PENDING_DOCS',
      bio: 'Expert trainer with 10 years experience in obedience training',
      profilePhotoUrl: 'https://cdn.test/photo.jpg',
      idFrontUrl: 'https://cdn.test/id-front.jpg',
      idBackUrl: 'https://cdn.test/id-back.jpg',
      certificationsJson: [{ name: 'CPDT-KA', issuer: 'CCPDT', year: 2020 }],
      city: 'Cairo',
      baseLat: 30.0,
      baseLng: 31.2,
      servicesJson: [{ type: 'TRAINING_SESSION_1HR', priceEgp: 300, deliveryMode: 'IN_HOME' }],
      inHomeVisits: true,
      ownFacility: false,
      virtualSessions: false,
      averageRating: null,
      totalSessions: 0,
    };

    it('should auto-approve when all fields present', async () => {
      // First call: initial find. Second call: after update (for checkAndAutoApprove re-fetch)
      mockPrisma.trainerProfile.findUnique
        .mockResolvedValueOnce(fullProfile)  // updateProfile initial find
        .mockResolvedValueOnce(fullProfile); // checkAndAutoApprove doesn't re-fetch (profile passed in)

      // The update returns the full profile which triggers checkAndAutoApprove
      mockPrisma.trainerProfile.update
        .mockResolvedValueOnce(fullProfile)   // updateProfile update call
        .mockResolvedValueOnce({ ...fullProfile, status: 'APPROVED' }); // auto-approve update

      mockPrisma.pricingBounds.findMany.mockResolvedValue([]);

      await service.updateProfile('u1', { bio: fullProfile.bio });

      // Should emit auto_approved event
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'trainer.auto_approved',
        expect.objectContaining({ userId: 'u1' }),
      );
    });

    it('should stay PENDING_DOCS when missing certification', async () => {
      const incomplete = { ...fullProfile, certificationsJson: null };
      mockPrisma.trainerProfile.findUnique.mockResolvedValue(incomplete);
      mockPrisma.trainerProfile.update.mockResolvedValue(incomplete);

      await service.updateProfile('u1', { bio: 'Updated bio text here' });

      // Should NOT emit auto_approved
      const approvalCall = mockEventEmitter.emit.mock.calls.find(
        (c: any[]) => c[0] === 'trainer.auto_approved',
      );
      expect(approvalCall).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Pricing guard
  // ──────────────────────────────────────────────────────────────────────────

  describe('updateProfile — pricing guard', () => {
    it('should reject out-of-bounds trainer prices', async () => {
      mockPrisma.trainerProfile.findUnique.mockResolvedValue({
        id: 'tp1',
        userId: 'u1',
        status: 'PENDING_DOCS',
        averageRating: null,
        totalSessions: 0,
      });
      mockPrisma.pricingBounds.findMany.mockResolvedValue([
        { serviceType: 'TRAINING_SESSION_1HR', minEgp: 150, defaultMaxEgp: 500, eliteMaxEgp: 1200 },
      ]);

      await expect(
        service.updateProfile('u1', {
          servicesJson: [
            { type: 'TRAINING_SESSION_1HR', priceEgp: 50, description: 'test', deliveryMode: 'IN_HOME' },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept in-bounds prices', async () => {
      mockPrisma.trainerProfile.findUnique.mockResolvedValue({
        id: 'tp1',
        userId: 'u1',
        status: 'PENDING_DOCS',
        averageRating: null,
        totalSessions: 0,
      });
      mockPrisma.pricingBounds.findMany.mockResolvedValue([
        { serviceType: 'TRAINING_SESSION_1HR', minEgp: 150, defaultMaxEgp: 500, eliteMaxEgp: 1200 },
      ]);
      mockPrisma.trainerProfile.update.mockResolvedValue({
        id: 'tp1',
        status: 'PENDING_DOCS',
      });

      await expect(
        service.updateProfile('u1', {
          servicesJson: [
            { type: 'TRAINING_SESSION_1HR', priceEgp: 300, description: 'test', deliveryMode: 'IN_HOME' },
          ],
        }),
      ).resolves.toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Session completion
  // ──────────────────────────────────────────────────────────────────────────

  describe('markSessionComplete', () => {
    it('should increment sessionsCompleted for a program', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent1',
        trainerProfileId: 'tp1',
        trainerProfile: { id: 'tp1', userId: 'u1' },
        status: 'active',
        sessionsCompleted: 2,
        sessionsTotal: 6,
        trainerNotes: [],
        providerPayout: 500,
      });
      mockPrisma.booking.update.mockResolvedValue({
        sessionsCompleted: 3,
        status: 'active',
      });

      const result = await service.markSessionComplete('u1', 'b1', {
        notes: 'Good progress on sit-stay',
        homework: 'Practice 3x daily',
      });

      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({
            sessionsCompleted: 3,
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'program.session_completed',
        expect.objectContaining({ sessionNumber: 3 }),
      );
    });

    it('should complete booking on final session', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        parentId: 'parent1',
        trainerProfileId: 'tp1',
        trainerProfile: { id: 'tp1', userId: 'u1' },
        status: 'active',
        sessionsCompleted: 5,
        sessionsTotal: 6,
        trainerNotes: [],
        providerPayout: 2000,
      });
      mockPrisma.booking.update.mockResolvedValue({
        sessionsCompleted: 6,
        status: 'completed',
      });
      mockPrisma.trainerProfile.update.mockResolvedValue({});

      await service.markSessionComplete('u1', 'b1', {});

      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionsCompleted: 6,
            status: 'completed',
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'program.completed',
        expect.objectContaining({ bookingId: 'b1' }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Search
  // ──────────────────────────────────────────────────────────────────────────

  describe('searchTrainers', () => {
    it('should return paginated results', async () => {
      mockPrisma.trainerProfile.findMany.mockResolvedValue([]);
      mockPrisma.trainerProfile.count.mockResolvedValue(0);

      const result = await service.searchTrainers({ city: 'Cairo', page: 1 });

      expect(result.pagination.page).toBe(1);
      expect(result.trainers).toEqual([]);
    });
  });
});
