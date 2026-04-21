import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

// Mocks
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
      GOOGLE_CLIENT_ID_WEB: undefined,
      FACEBOOK_APP_ID: undefined,
    };
    return map[key] ?? def;
  }),
};

const mockNotifications = {
  sendEmail: jest.fn(),
  sendSms: jest.fn(),
};

const mockMail = {
  sendWelcome: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RedisService, useValue: mockRedis },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: MailService, useValue: mockMail },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    // Inject mocks directly since NestJS DI uses string tokens for some
    (service as any).prisma = mockPrisma;
    (service as any).redis = mockRedis;
    (service as any).jwtService = mockJwt;
    (service as any).configService = mockConfig;
    (service as any).notifications = mockNotifications;
    (service as any).mailService = mockMail;
    (service as any).eventEmitter = mockEventEmitter;
  });

  // ─── Register ───────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', firstName: 'Test', lastName: 'User',
        roles: ['PARENT'], authProvider: 'email', emailVerified: false,
        activeRole: 'parent', isParent: true, isPetFriend: false,
        createdAt: new Date(),
      });

      const result = await service.register({
        email: 'test@test.com', password: 'Test1234', firstName: 'Test', lastName: 'User',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('test@test.com');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.signed_up', expect.any(Object));
    });

    it('should reject duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register({
        email: 'dup@test.com', password: 'Test1234', firstName: 'A', lastName: 'B',
      })).rejects.toThrow(ConflictException);
    });
  });

  // ─── Forgot Password ───────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should return generic message even for non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@test.com');
      expect(result.message).toContain('If that email is registered');
    });

    it('should store token and send email for valid user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'valid@test.com', firstName: 'Test', authProvider: 'email',
      });

      const result = await service.forgotPassword('valid@test.com');
      expect(result.message).toContain('If that email is registered');
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockMail.sendPasswordReset).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.password_reset_requested', expect.any(Object));
    });
  });

  // ─── Reset Password ────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should reject invalid/expired token', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'NewPass123'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject weak password (no uppercase)', async () => {
      mockRedis.get.mockResolvedValue('user-1');

      await expect(service.resetPassword('valid-token', 'nouppercasenum1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject weak password (no number)', async () => {
      mockRedis.get.mockResolvedValue('user-1');

      await expect(service.resetPassword('valid-token', 'NoNumberHere'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject weak password (too short)', async () => {
      mockRedis.get.mockResolvedValue('user-1');

      await expect(service.resetPassword('valid-token', 'Ab1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should reset password with valid token and strong password', async () => {
      mockRedis.get.mockResolvedValue('user-1');
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.resetPassword('valid-token', 'NewPass123');
      expect(result.message).toContain('Password reset successfully');
      expect(mockRedis.del).toHaveBeenCalledWith('forgot:valid-token');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.password_reset_completed', { userId: 'user-1' });
    });
  });

  // ─── Verify Email (token-based) ────────────────────────────────────────

  describe('verifyEmailByToken', () => {
    it('should reject invalid token', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.verifyEmailByToken('bad-token'))
        .rejects.toThrow(BadRequestException);
    });

    it('should verify email with valid token', async () => {
      mockRedis.get.mockResolvedValue('user-1');
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyEmailByToken('valid-token');
      expect(result.message).toContain('Email verified');
      expect(mockRedis.del).toHaveBeenCalledWith('verify:valid-token');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.email_verified', { userId: 'user-1' });
    });
  });

  // ─── Social Login ──────────────────────────────────────────────────────

  describe('socialLogin', () => {
    it('should return 501 for Google when GOOGLE_CLIENT_ID_WEB not set', async () => {
      await expect(service.socialLogin({
        provider: 'google', token: 'fake-token',
      })).rejects.toThrow(NotImplementedException);
    });

    it('should return 501 for Facebook when FACEBOOK_APP_ID not set', async () => {
      await expect(service.socialLogin({
        provider: 'facebook', token: 'fake-token',
      })).rejects.toThrow(NotImplementedException);
    });

    it('should reject missing token', async () => {
      await expect(service.socialLogin({
        provider: 'google', token: '',
      })).rejects.toThrow();
    });
  });

  // ─── Add Role ──────────────────────────────────────────────────────────

  describe('addRole', () => {
    it('should reject unknown role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['PARENT'] });

      await expect(service.addRole('user-1', 'INVALID_ROLE'))
        .rejects.toThrow(BadRequestException);
    });

    it('should be idempotent when role already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['PARENT', 'PETFRIEND'] });

      const result = await service.addRole('user-1', 'PETFRIEND');
      expect(result.message).toContain('already active');
      expect(result.roles).toEqual(['PARENT', 'PETFRIEND']);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should add new role and emit event', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', roles: ['PARENT'] });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.addRole('user-1', 'TRAINER');
      expect(result.roles).toEqual(['PARENT', 'TRAINER']);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('user.role_added', expect.objectContaining({
        userId: 'user-1', role: 'TRAINER',
      }));
    });

    it('should reject role for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addRole('missing', 'PARENT'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ─── Get My Roles ──────────────────────────────────────────────────────

  describe('getMyRoles', () => {
    it('should return roles and primary role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ roles: ['PARENT', 'PETFRIEND'] });

      const result = await service.getMyRoles('user-1');
      expect(result.roles).toEqual(['PARENT', 'PETFRIEND']);
      expect(result.primaryRole).toBe('PARENT');
    });
  });

  // ─── Get Me ────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('should return user with profiles and createdAt', async () => {
      const now = new Date();
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'test@test.com', firstName: 'Test', lastName: 'User',
        roles: ['PARENT'], authProvider: 'email', emailVerified: true,
        role: 'user', createdAt: now,
        petFriendProfile: null, trainerProfile: null, kennelProfile: null, petHotelProfile: null,
        pets: [],
      });

      const result = await service.getMe('user-1');
      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@test.com');
      expect(result.authProvider).toBe('email');
      expect(result.createdAt).toBe(now);
      expect(result.profiles).toBeDefined();
    });

    it('should throw NotFoundException for missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
