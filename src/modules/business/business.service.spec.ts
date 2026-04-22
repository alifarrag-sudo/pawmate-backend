import { Test, TestingModule } from '@nestjs/testing';
import { BusinessService } from './business.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../../common/services/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('BusinessService', () => {
  let service: BusinessService;
  let prisma: any;
  let uploads: any;
  let mail: any;
  let redis: any;
  let events: any;

  const mockUser = {
    id: 'user-1',
    firstName: 'Ali',
    lastName: 'Test',
    email: 'ali@test.com',
    roles: ['PARENT'],
  };

  beforeEach(async () => {
    prisma = {
      businessProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      businessBranch: { create: jest.fn() },
      teamMember: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      teamInvite: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      petFriendProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      trainerProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    uploads = { uploadFile: jest.fn().mockResolvedValue({ url: 'https://cdn.test/file.jpg' }) };
    mail = {
      sendTeamInvite: jest.fn().mockResolvedValue(undefined),
      sendTeamWelcomeWithLoginLink: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadsService, useValue: uploads },
        { provide: MailService, useValue: mail },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);
  });

  describe('applyForBusiness', () => {
    it('should create a business profile and OWNER team member', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue(null);
      const created = { id: 'biz-1', ownerId: 'user-1', status: 'PENDING_DOCS', businessName: 'Test Kennel' };
      prisma.businessProfile.create.mockResolvedValue(created);
      prisma.teamMember.create.mockResolvedValue({ id: 'tm-1', role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, roles: ['PARENT', 'OPERATOR'] });

      const result = await service.applyForBusiness('user-1', {
        businessName: 'Test Kennel',
        businessType: 'KENNEL',
        businessEmail: 'biz@test.com',
        businessPhone: '+201234567890',
        primaryAddress: '123 Test St',
        primaryCity: 'Cairo',
      });

      expect(result.id).toBe('biz-1');
      expect(prisma.teamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER' }) }),
      );
      expect(events.emit).toHaveBeenCalledWith('business.applied', expect.any(Object));
    });

    it('should reject duplicate business application', async () => {
      prisma.businessProfile.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.applyForBusiness('user-1', {
          businessName: 'Test', businessType: 'KENNEL',
          businessEmail: 'a@b.com', businessPhone: '123',
          primaryAddress: 'addr', primaryCity: 'Cairo',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateProfile', () => {
    it('should auto-approve when all required docs present', async () => {
      const completeBiz = {
        id: 'biz-1', ownerId: 'user-1', status: 'PENDING_DOCS',
        businessName: 'Test', businessType: 'KENNEL', description: 'desc',
        logoUrl: 'logo.jpg', commercialRegDocUrl: 'reg.pdf', taxCard: 'tax.pdf',
        primaryAddress: 'addr', primaryLat: 30.0, primaryLng: 31.0,
        businessEmail: 'a@b.com', businessPhone: '123',
      };
      prisma.businessProfile.findUnique.mockResolvedValue(completeBiz);
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.businessProfile.update
        .mockResolvedValueOnce(completeBiz)
        .mockResolvedValueOnce({ ...completeBiz, status: 'APPROVED', autoApprovedAt: new Date() });

      const result = await service.updateProfile('user-1', { description: 'updated' });

      expect(result.status).toBe('APPROVED');
      expect(events.emit).toHaveBeenCalledWith('business.auto_approved', expect.any(Object));
    });

    it('should reject MANAGER from editing business profile', async () => {
      const biz = {
        id: 'biz-1', ownerId: 'user-1', status: 'PENDING_DOCS',
        businessName: 'Test', businessType: 'KENNEL',
      };
      prisma.businessProfile.findUnique.mockResolvedValue(biz);
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'MANAGER' });

      await expect(
        service.updateProfile('user-1', { description: 'updated' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createInvite', () => {
    it('should generate invite code with 14-day expiry', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.teamInvite.create.mockImplementation(async ({ data }) => ({
        id: 'inv-1',
        ...data,
      }));
      prisma.businessProfile.findUnique.mockResolvedValue({ businessName: 'Test Biz' });

      const result = await service.createInvite('user-1', 'biz-1', {
        email: 'team@test.com',
        targetProviderType: 'PETFRIEND',
      });

      expect(result.inviteCode).toHaveLength(12);
      const expiry = new Date(result.expiresAt);
      const now = new Date();
      const diffDays = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(14, 0);
      expect(events.emit).toHaveBeenCalledWith('team.invite_sent', expect.any(Object));
    });

    it('should allow MANAGER to create invite', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'MANAGER' });
      prisma.teamInvite.create.mockImplementation(async ({ data }) => ({ id: 'inv-2', ...data }));
      prisma.businessProfile.findUnique.mockResolvedValue({ businessName: 'Test Biz' });

      const result = await service.createInvite('user-2', 'biz-1', {
        email: 'team2@test.com',
        targetProviderType: 'PETFRIEND',
      });

      expect(result.inviteCode).toHaveLength(12);
    });

    it('should reject MANAGER from creating OWNER invite', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'MANAGER' });

      await expect(
        service.createInvite('user-2', 'biz-1', {
          email: 'team@test.com',
          targetProviderType: 'PETFRIEND',
          targetRole: 'OWNER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('joinTeam', () => {
    it('should join team and create provider profile if new', async () => {
      const invite = {
        id: 'inv-1',
        inviteCode: 'ABC123DEF456',
        businessId: 'biz-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86400000),
        targetRole: 'PROVIDER',
        targetProviderType: 'PETFRIEND',
        business: { businessName: 'Test' },
      };
      prisma.teamInvite.findUnique.mockResolvedValue(invite);
      prisma.teamMember.findUnique.mockResolvedValue(null);
      // team size check
      prisma.businessProfile.findUnique.mockResolvedValue({ businessTier: 'FREE' });
      prisma.teamMember.count.mockResolvedValue(3); // well under limit
      prisma.petFriendProfile.findUnique.mockResolvedValue(null);
      prisma.petFriendProfile.create.mockResolvedValue({ id: 'pf-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', roles: ['PARENT'] });
      prisma.user.update.mockResolvedValue({ id: 'user-2', roles: ['PARENT', 'PETFRIEND'] });
      prisma.teamMember.create.mockResolvedValue({ id: 'tm-2', status: 'ACTIVE' });
      prisma.teamInvite.update.mockResolvedValue({ ...invite, status: 'USED' });

      const result = await service.joinTeam('user-2', 'ABC123DEF456');

      expect(result.status).toBe('ACTIVE');
      expect(prisma.petFriendProfile.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith('team.member_joined', expect.any(Object));
    });

    it('should reject expired invite', async () => {
      prisma.teamInvite.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'PENDING',
        expiresAt: new Date(Date.now() - 86400000),
      });
      prisma.teamInvite.update.mockResolvedValue({});

      await expect(service.joinTeam('user-2', 'EXPIRED123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeTeamMember', () => {
    it('should remove member but preserve their individual profile', async () => {
      prisma.teamMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ id: 'tm-2', businessId: 'biz-1', userId: 'user-2', role: 'PROVIDER' });
      prisma.teamMember.update.mockResolvedValue({ id: 'tm-2', status: 'REMOVED' });

      const result = await service.removeTeamMember('user-1', 'biz-1', 'tm-2');

      expect(result.status).toBe('REMOVED');
      expect(events.emit).toHaveBeenCalledWith('team.member_removed', expect.any(Object));
    });

    it('should not allow removing the OWNER', async () => {
      prisma.teamMember.findUnique
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ id: 'tm-1', businessId: 'biz-1', role: 'OWNER' });

      await expect(service.removeTeamMember('user-1', 'biz-1', 'tm-1')).rejects.toThrow(ForbiddenException);
    });

    it('should allow MANAGER to remove PROVIDER', async () => {
      prisma.teamMember.findUnique
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ id: 'tm-3', businessId: 'biz-1', userId: 'user-3', role: 'PROVIDER' });
      prisma.teamMember.update.mockResolvedValue({ id: 'tm-3', status: 'REMOVED' });

      const result = await service.removeTeamMember('user-2', 'biz-1', 'tm-3');
      expect(result.status).toBe('REMOVED');
    });
  });

  describe('directCreateMember', () => {
    it('should create user with one-time-login link (not temp password)', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      // team size check
      prisma.businessProfile.findUnique
        .mockResolvedValueOnce({ businessTier: 'FREE' }) // assertTeamSizeLimit
        .mockResolvedValueOnce({ businessName: 'Test Biz' }); // after creation
      prisma.teamMember.count.mockResolvedValue(5);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-user', email: 'new@test.com' });
      prisma.petFriendProfile.create.mockResolvedValue({ id: 'pf-new' });
      prisma.teamMember.create.mockResolvedValue({ id: 'tm-new', status: 'ACTIVE' });

      const result = await service.directCreateMember('user-1', 'biz-1', {
        firstName: 'New', lastName: 'Member', email: 'new@test.com',
        phone: '+20123', targetProviderType: 'PETFRIEND',
      });

      expect(result.oneTimeLoginLinkSent).toBe(true);
      expect(result).not.toHaveProperty('tempPasswordSent');
      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^olt:/),
        7 * 24 * 60 * 60,
        'new-user',
      );
      expect(mail.sendTeamWelcomeWithLoginLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@test.com' }),
        'Test Biz',
        expect.stringContaining('https://pawmatehub.com/auth/one-time?token='),
      );
      expect(events.emit).toHaveBeenCalledWith('team.member_direct_created', expect.any(Object));
    });

    it('should reject when MANAGER tries to assign OWNER role', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'MANAGER' });

      await expect(
        service.directCreateMember('user-2', 'biz-1', {
          firstName: 'New', lastName: 'Member', email: 'new@test.com',
          phone: '+20123', targetProviderType: 'PETFRIEND', targetRole: 'OWNER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('team size limit', () => {
    it('should enforce FREE tier limit of 25 members on direct-create', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.businessProfile.findUnique.mockResolvedValue({ businessTier: 'FREE' });
      prisma.teamMember.count.mockResolvedValue(25); // at limit
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.directCreateMember('user-1', 'biz-1', {
          firstName: 'New', lastName: 'Member', email: 'new@test.com',
          phone: '+20123', targetProviderType: 'PETFRIEND',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow up to 50 members on PREMIUM tier', async () => {
      prisma.teamMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.businessProfile.findUnique
        .mockResolvedValueOnce({ businessTier: 'PREMIUM' }) // assertTeamSizeLimit
        .mockResolvedValueOnce({ businessName: 'Test Biz' }); // after creation
      prisma.teamMember.count.mockResolvedValue(30); // over free limit but under premium
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-user', email: 'new@test.com' });
      prisma.petFriendProfile.create.mockResolvedValue({ id: 'pf-new' });
      prisma.teamMember.create.mockResolvedValue({ id: 'tm-new', status: 'ACTIVE' });

      const result = await service.directCreateMember('user-1', 'biz-1', {
        firstName: 'New', lastName: 'Member', email: 'new@test.com',
        phone: '+20123', targetProviderType: 'PETFRIEND',
      });

      expect(result.oneTimeLoginLinkSent).toBe(true);
    });

    it('should enforce team size on joinTeam for new members', async () => {
      const invite = {
        id: 'inv-1', inviteCode: 'ABC123DEF456', businessId: 'biz-1',
        status: 'PENDING', expiresAt: new Date(Date.now() + 86400000),
        targetRole: 'PROVIDER', targetProviderType: 'PETFRIEND',
        business: { businessName: 'Test' },
      };
      prisma.teamInvite.findUnique.mockResolvedValue(invite);
      prisma.teamMember.findUnique.mockResolvedValue(null); // not existing member
      prisma.businessProfile.findUnique.mockResolvedValue({ businessTier: 'FREE' });
      prisma.teamMember.count.mockResolvedValue(25); // at limit

      await expect(service.joinTeam('user-2', 'ABC123DEF456')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('searchBusinesses', () => {
    it('should return paginated approved businesses', async () => {
      prisma.businessProfile.findMany.mockResolvedValue([
        { id: 'biz-1', businessName: 'Test', _count: { teamMembers: 5 }, branches: [{ id: 'b1', city: 'Cairo' }] },
      ]);
      prisma.businessProfile.count.mockResolvedValue(1);

      const result = await service.searchBusinesses('Cairo', undefined, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].teamCount).toBe(5);
      expect(result.total).toBe(1);
    });
  });
});
