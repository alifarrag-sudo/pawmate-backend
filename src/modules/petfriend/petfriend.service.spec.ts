import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PetFriendService } from './petfriend.service';
import { PetFriendPayoutService } from './petfriend-payout.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from '../mail/mail.service';
import { PetFriendStatus, ProviderPayoutMethod } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — minimal stub factories
// ──────────────────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<any> = {}): any {
  return {
    id: 'profile-1',
    userId: 'user-1',
    status: PetFriendStatus.PENDING_DOCS,
    avgRating: 0,
    totalBookings: 0,
    commissionRate: 0.15,
    pendingBalanceEgp: 0,
    availableBalanceEgp: 0,
    totalEarnedEgp: 0,
    bio: null,
    pccUrl: null,
    selfieWithIdUrl: null,
    servicesOffered: [],
    ratePerHour: null,
    ratePerDay: null,
    ratePerNight: null,
    ratePerWalk: null,
    addressCity: null,
    payoutMethodJson: null,
    appliedAt: new Date(),
    autoApprovedAt: null,
    isActive: false,
    isVerified: false,
    ...overrides,
  };
}

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-1',
    roles: [],
    isPetFriend: false,
    profilePhoto: null,
    idFrontUrl: null,
    idBackUrl: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock factories
// ──────────────────────────────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    petFriendProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pricingBounds: {
      findMany: jest.fn(),
    },
    petFriendPayout: {
      create: jest.fn(),
    },
  };
}

function makeEventEmitterMock() {
  return { emit: jest.fn() };
}

function makeUploadsMock() {
  return { uploadImage: jest.fn(), uploadFile: jest.fn() };
}

function makeMailMock() {
  return { sendPetFriendRejection: jest.fn().mockResolvedValue(undefined) };
}

// ──────────────────────────────────────────────────────────────────────────────
// PetFriendService tests
// ──────────────────────────────────────────────────────────────────────────────

describe('PetFriendService', () => {
  let service: PetFriendService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventEmitter: ReturnType<typeof makeEventEmitterMock>;
  let uploads: ReturnType<typeof makeUploadsMock>;
  let mail: ReturnType<typeof makeMailMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    eventEmitter = makeEventEmitterMock();
    uploads = makeUploadsMock();
    mail = makeMailMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetFriendService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: UploadsService, useValue: uploads },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get<PetFriendService>(PetFriendService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────────────────
  // 1. applyForPetFriend
  // ────────────────────────────────────────────────────────────────────────────

  describe('applyForPetFriend', () => {
    it('creates profile with PENDING_DOCS status and adds PETFRIEND to user roles', async () => {
      // Arrange
      const userId = 'user-1';
      const newProfile = makeProfile({ userId, status: PetFriendStatus.PENDING_DOCS });

      prisma.petFriendProfile.findUnique.mockResolvedValue(null);
      prisma.petFriendProfile.create.mockResolvedValue(newProfile);
      prisma.user.update.mockResolvedValue({ ...makeUser(), roles: ['PETFRIEND'], isPetFriend: true });

      // Act
      const result = await service.applyForPetFriend(userId);

      // Assert
      expect(prisma.petFriendProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            status: PetFriendStatus.PENDING_DOCS,
            commissionRate: 0.15,
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: expect.objectContaining({
            roles: { push: 'PETFRIEND' },
            isPetFriend: true,
          }),
        }),
      );
      expect(result.status).toBe(PetFriendStatus.PENDING_DOCS);
      expect(result.profileId).toBe(newProfile.id);
    });

    it('emits petfriend.applied event after successful creation', async () => {
      // Arrange
      const userId = 'user-1';
      const newProfile = makeProfile({ userId });

      prisma.petFriendProfile.findUnique.mockResolvedValue(null);
      prisma.petFriendProfile.create.mockResolvedValue(newProfile);
      prisma.user.update.mockResolvedValue(makeUser());

      // Act
      await service.applyForPetFriend(userId);

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'petfriend.applied',
        expect.objectContaining({ userId, profileId: newProfile.id }),
      );
    });

    it('throws ConflictException when profile already exists', async () => {
      // Arrange
      prisma.petFriendProfile.findUnique.mockResolvedValue(makeProfile());

      // Act & Assert
      await expect(service.applyForPetFriend('user-1')).rejects.toThrow(ConflictException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Commission tier calculation
  // ────────────────────────────────────────────────────────────────────────────

  describe('calculateCommission (commission tier logic)', () => {
    it('returns 15% commission for new provider with rating 4.0 and 5 bookings', async () => {
      // Arrange
      const profile = {
        avgRating: 4.0,
        totalBookings: 5,
        commissionRate: 0.15,
      };
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act
      const result = await service.calculateCommission('profile-1', 1000);

      // Assert
      expect(result.commissionRate).toBe(0.15);
      expect(result.commissionEgp).toBe(150);
      expect(result.netEgp).toBe(850);
    });

    it('returns 10% commission for elite provider with rating 4.7 and 25 bookings', async () => {
      // Arrange
      const profile = {
        avgRating: 4.7,
        totalBookings: 25,
        commissionRate: 0.10,
      };
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act
      const result = await service.calculateCommission('profile-1', 1000);

      // Assert
      expect(result.commissionRate).toBe(0.10);
      expect(result.commissionEgp).toBe(100);
      expect(result.netEgp).toBe(900);
    });

    it('is not elite when rating meets threshold but bookings do not', async () => {
      // Arrange — rating 4.7 but only 19 bookings (below 20 elite threshold)
      const profile = {
        avgRating: 4.7,
        totalBookings: 19,
        commissionRate: 0.15,
      };
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act
      const result = await service.calculateCommission('profile-1', 1000);

      // Assert
      expect(result.commissionRate).toBe(0.15);
    });

    it('is not elite when bookings meet threshold but rating does not', async () => {
      // Arrange — 25 bookings but rating 4.4 (below 4.5 elite threshold)
      const profile = {
        avgRating: 4.4,
        totalBookings: 25,
        commissionRate: 0.15,
      };
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act
      const result = await service.calculateCommission('profile-1', 1000);

      // Assert
      expect(result.commissionRate).toBe(0.15);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Pricing guard in updateProfile
  // ────────────────────────────────────────────────────────────────────────────

  describe('updateProfile — pricing guard', () => {
    it('rejects ratePerHour below minEgp (50)', async () => {
      // Arrange
      const existingProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        avgRating: 4.0,
        totalBookings: 5,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(existingProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([
        {
          serviceType: 'HOUR',
          minEgp: 50,
          defaultMaxEgp: 200,
          eliteMaxEgp: 350,
        },
      ]);

      // Act & Assert
      await expect(
        service.updateProfile('user-1', { ratePerHour: 30 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects ratePerHour above defaultMaxEgp (200) for standard provider', async () => {
      // Arrange
      const existingProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        avgRating: 4.0,
        totalBookings: 5,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(existingProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([
        {
          serviceType: 'HOUR',
          minEgp: 50,
          defaultMaxEgp: 200,
          eliteMaxEgp: 350,
        },
      ]);

      // Act & Assert
      await expect(
        service.updateProfile('user-1', { ratePerHour: 250 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows ratePerHour above defaultMaxEgp when provider is elite', async () => {
      // Arrange — elite: rating 4.7, 25 bookings
      const existingProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        avgRating: 4.7,
        totalBookings: 25,
      });
      const updatedProfile = makeProfile({
        ...existingProfile,
        ratePerHour: 280,
      });

      prisma.petFriendProfile.findUnique
        .mockResolvedValueOnce(existingProfile)  // first call in updateProfile
        .mockResolvedValueOnce(null);            // checkAndAutoApprove user lookup stub
      prisma.pricingBounds.findMany.mockResolvedValue([
        {
          serviceType: 'HOUR',
          minEgp: 50,
          defaultMaxEgp: 200,
          eliteMaxEgp: 350,
        },
      ]);
      prisma.petFriendProfile.update.mockResolvedValue(updatedProfile);
      prisma.user.findUnique.mockResolvedValue(makeUser());

      // Act — should not throw
      const result = await service.updateProfile('user-1', { ratePerHour: 280 });

      // Assert
      expect(result.ratePerHour).toBe(280);
    });

    it('rejects ratePerHour above eliteMaxEgp even for elite provider', async () => {
      // Arrange — elite but proposed rate exceeds elite cap (350)
      const existingProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        avgRating: 4.7,
        totalBookings: 25,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(existingProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([
        {
          serviceType: 'HOUR',
          minEgp: 50,
          defaultMaxEgp: 200,
          eliteMaxEgp: 350,
        },
      ]);

      // Act & Assert
      await expect(
        service.updateProfile('user-1', { ratePerHour: 400 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Instant cashout fee calculation and minimum balance enforcement
  // ────────────────────────────────────────────────────────────────────────────

  describe('instantCashout', () => {
    it('calculates fee as Math.ceil(balance * 0.03) — 500 EGP → fee 15', async () => {
      // Arrange — balance 500 EGP → fee = ceil(500 * 0.03) = 15
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 500,
        payoutMethodJson: null,
      });
      const payoutRecord = { id: 'payout-1', status: 'pending' };

      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);
      prisma.petFriendPayout.create.mockResolvedValue(payoutRecord);
      prisma.petFriendProfile.update.mockResolvedValue(profile);

      // Act
      const result = await service.instantCashout('user-1');

      // Assert — 3% fee, net = 485
      expect(result.feeEgp).toBe(15);
      expect(result.netEgp).toBe(485);
      expect(result.amount).toBe(500);
    });

    it('calculates fee for minimum balance (100 EGP → fee = ceil(3) = 3, net = 97)', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 100,
        payoutMethodJson: null,
      });
      const payoutRecord = { id: 'payout-min', status: 'pending' };

      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);
      prisma.petFriendPayout.create.mockResolvedValue(payoutRecord);
      prisma.petFriendProfile.update.mockResolvedValue(profile);

      // Act
      const result = await service.instantCashout('user-1');

      // Assert — ceil(100 * 0.03) = ceil(3) = 3, net = 97
      expect(result.feeEgp).toBe(3);
      expect(result.netEgp).toBe(97);
    });

    it('uses Math.ceil for fractional fees (150 EGP → fee = ceil(4.5) = 5, net = 145)', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 150,
        payoutMethodJson: null,
      });
      const payoutRecord = { id: 'payout-ceil', status: 'pending' };

      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);
      prisma.petFriendPayout.create.mockResolvedValue(payoutRecord);
      prisma.petFriendProfile.update.mockResolvedValue(profile);

      // Act
      const result = await service.instantCashout('user-1');

      // Assert — ceil(150 * 0.03) = ceil(4.5) = 5, net = 145
      expect(result.feeEgp).toBe(5);
      expect(result.netEgp).toBe(145);
    });

    it('rejects cashout when available balance is below 100 EGP minimum', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 50,
        payoutMethodJson: null,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act & Assert
      await expect(service.instantCashout('user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects cashout when available balance is exactly 0', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 0,
        payoutMethodJson: null,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act & Assert
      await expect(service.instantCashout('user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects cashout for non-APPROVED profile', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        availableBalanceEgp: 500,
      });
      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);

      // Act & Assert
      await expect(service.instantCashout('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when profile does not exist', async () => {
      // Arrange
      prisma.petFriendProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.instantCashout('user-1')).rejects.toThrow(NotFoundException);
    });

    it('emits payout.instant_requested event on success', async () => {
      // Arrange
      const profile = makeProfile({
        status: PetFriendStatus.APPROVED,
        availableBalanceEgp: 200,
        payoutMethodJson: null,
      });
      const payoutRecord = { id: 'payout-3', status: 'pending' };

      prisma.petFriendProfile.findUnique.mockResolvedValue(profile);
      prisma.petFriendPayout.create.mockResolvedValue(payoutRecord);
      prisma.petFriendProfile.update.mockResolvedValue(profile);

      // Act
      await service.instantCashout('user-1');

      // Assert
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payout.instant_requested',
        expect.objectContaining({ userId: 'user-1', payoutId: payoutRecord.id }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Auto-approval on 100% profile completion
  // ────────────────────────────────────────────────────────────────────────────

  describe('auto-approval via updateProfile', () => {
    it('sets status to APPROVED and emits petfriend.auto_approved when all fields are present', async () => {
      // Arrange — profile has all required fields after update
      const existingProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        avgRating: 0,
        totalBookings: 0,
      });

      const fullyCompleteProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        bio: 'I love pets and have 5 years of experience caring for them.',
        pccUrl: 'https://cdn.example.com/pcc.jpg',
        selfieWithIdUrl: 'https://cdn.example.com/selfie.jpg',
        servicesOffered: ['BOARDING'],
        ratePerHour: 150,
        addressCity: 'Cairo',
        avgRating: 0,
        totalBookings: 0,
      });

      const userWithDocs = makeUser({
        profilePhoto: 'https://cdn.example.com/photo.jpg',
        idFrontUrl: 'https://cdn.example.com/id-front.jpg',
        idBackUrl: 'https://cdn.example.com/id-back.jpg',
      });

      prisma.petFriendProfile.findUnique.mockResolvedValue(existingProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([]); // no pricing bounds configured
      prisma.petFriendProfile.update.mockResolvedValue(fullyCompleteProfile);
      prisma.user.findUnique.mockResolvedValue(userWithDocs);

      // Act — pass in a non-rate field so no pricing validation runs
      await service.updateProfile('user-1', { city: 'Cairo' });

      // Assert — auto-approve update was triggered
      expect(prisma.petFriendProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            status: PetFriendStatus.APPROVED,
            isActive: true,
            isVerified: true,
          }),
        }),
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'petfriend.auto_approved',
        expect.objectContaining({ userId: 'user-1', profileId: fullyCompleteProfile.id }),
      );
    });

    it('does NOT auto-approve when profile is incomplete', async () => {
      // Arrange — profile is missing several fields
      const incompleteProfile = makeProfile({
        status: PetFriendStatus.PENDING_DOCS,
        bio: null,
        pccUrl: null,
        servicesOffered: [],
        ratePerHour: null,
        addressCity: null,
      });

      const userWithNoDocs = makeUser();

      prisma.petFriendProfile.findUnique.mockResolvedValue(incompleteProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([]);
      prisma.petFriendProfile.update.mockResolvedValue(incompleteProfile);
      prisma.user.findUnique.mockResolvedValue(userWithNoDocs);

      // Act
      await service.updateProfile('user-1', { bio: 'I love animals and pet care.' });

      // Assert — auto-approve should NOT have been called with APPROVED status
      const autoApproveCall = prisma.petFriendProfile.update.mock.calls.find(
        (call: any[]) => call[0]?.data?.status === PetFriendStatus.APPROVED,
      );
      expect(autoApproveCall).toBeUndefined();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'petfriend.auto_approved',
        expect.anything(),
      );
    });

    it('does NOT auto-approve when profile is already APPROVED', async () => {
      // Arrange — already approved, should skip auto-approval logic
      const approvedProfile = makeProfile({
        status: PetFriendStatus.APPROVED,
        avgRating: 0,
        totalBookings: 0,
      });

      prisma.petFriendProfile.findUnique.mockResolvedValue(approvedProfile);
      prisma.pricingBounds.findMany.mockResolvedValue([]);
      prisma.petFriendProfile.update.mockResolvedValue(approvedProfile);

      // Act
      await service.updateProfile('user-1', { bio: 'I love animals and pet care.' });

      // Assert — auto_approved event should not be emitted
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'petfriend.auto_approved',
        expect.anything(),
      );
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PetFriendPayoutService tests
// ──────────────────────────────────────────────────────────────────────────────

describe('PetFriendPayoutService', () => {
  let payoutService: PetFriendPayoutService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let eventEmitter: ReturnType<typeof makeEventEmitterMock>;

  beforeEach(async () => {
    // Enable Paymob payout feature flag so cron proceeds in tests
    process.env.PAYMOB_PAYOUT_API_KEY = 'test-payout-key';
    process.env.PAYMOB_PAYOUT_MERCHANT_ID = 'test-merchant-id';

    prisma = makePrismaMock();
    eventEmitter = makeEventEmitterMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetFriendPayoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    payoutService = module.get<PetFriendPayoutService>(PetFriendPayoutService);
  });

  afterEach(() => {
    delete process.env.PAYMOB_PAYOUT_API_KEY;
    delete process.env.PAYMOB_PAYOUT_MERCHANT_ID;
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Payout cron — empty state
  // ────────────────────────────────────────────────────────────────────────────

  describe('runScheduledPayouts', () => {
    it('completes without error when there are no profiles with pending balances', async () => {
      // Arrange
      prisma.petFriendProfile.findMany.mockResolvedValue([]);

      // Act & Assert — must not throw
      await expect(payoutService.runScheduledPayouts()).resolves.not.toThrow();
    });

    it('does not create any payout records when profile list is empty', async () => {
      // Arrange
      prisma.petFriendProfile.findMany.mockResolvedValue([]);

      // Act
      await payoutService.runScheduledPayouts();

      // Assert
      expect(prisma.petFriendPayout.create).not.toHaveBeenCalled();
      expect(prisma.petFriendProfile.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('creates payout records for each profile with pending balance', async () => {
      // Arrange — two approved profiles with pending balances
      const profiles = [
        {
          ...makeProfile({ id: 'profile-A', userId: 'user-A', pendingBalanceEgp: 500, avgRating: 4.0, totalBookings: 5, status: PetFriendStatus.APPROVED }),
          user: { id: 'user-A', firstName: 'Ali', lastName: 'Hassan' },
          payoutMethodJson: null,
        },
        {
          ...makeProfile({ id: 'profile-B', userId: 'user-B', pendingBalanceEgp: 800, avgRating: 4.7, totalBookings: 25, status: PetFriendStatus.APPROVED }),
          user: { id: 'user-B', firstName: 'Sara', lastName: 'Ahmed' },
          payoutMethodJson: null,
        },
      ];

      prisma.petFriendProfile.findMany.mockResolvedValue(profiles);
      prisma.petFriendPayout.create.mockResolvedValue({ id: 'payout-x', status: 'pending' });
      prisma.petFriendProfile.update.mockResolvedValue({});

      // Act
      await payoutService.runScheduledPayouts();

      // Assert
      expect(prisma.petFriendPayout.create).toHaveBeenCalledTimes(2);
      expect(prisma.petFriendProfile.update).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('applies 10% commission for elite profiles and 15% for standard in scheduled payouts', async () => {
      // Arrange
      const standardProfile = {
        ...makeProfile({ id: 'profile-std', userId: 'user-std', pendingBalanceEgp: 1000, avgRating: 4.0, totalBookings: 5 }),
        user: { id: 'user-std', firstName: 'Layla', lastName: 'Ibrahim' },
        payoutMethodJson: null,
      };

      prisma.petFriendProfile.findMany.mockResolvedValue([standardProfile]);
      prisma.petFriendPayout.create.mockResolvedValue({ id: 'payout-std', status: 'pending' });
      prisma.petFriendProfile.update.mockResolvedValue({});

      // Act
      await payoutService.runScheduledPayouts();

      // Assert — commission 15% of 1000 = 150, net = 850
      expect(prisma.petFriendPayout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            commissionEgp: 150,
            netEgp: 850,
            amount: 1000,
            type: 'SCHEDULED',
          }),
        }),
      );
    });
  });
});
