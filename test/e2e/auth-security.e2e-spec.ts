/**
 * Suite 8 -- Auth Security
 *
 * Tests AuthService register, login, password reset, and role enforcement
 * with mocked Prisma, Redis, JWT, and mail. Validates the critical auth
 * paths including credential checks, token generation, and investor guard.
 */

import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { buildTestModule, TestContext } from '../helpers/test-app.helper';
import { AuthService } from '../../src/modules/auth/auth.service';
import { InvestorGuard } from '../../src/modules/investor/investor.guard';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { createUser, createInvestor } from '../factories/user.factory';

// ── Mock factories ─────────────────────────────────────────────────────────

function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
  };
}

function createMockConfigService() {
  const config: Record<string, string> = {
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
  };
  return {
    get: jest.fn((key: string, defaultValue?: string) => config[key] ?? defaultValue),
  };
}

function createMockNotifications() {
  return {
    sendSms: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendPush: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('Auth Security', () => {
  let ctx: TestContext;
  let authService: AuthService;

  beforeEach(async () => {
    ctx = await buildTestModule([
      AuthService,
      { provide: JwtService, useValue: createMockJwtService() },
      { provide: ConfigService, useValue: createMockConfigService() },
      { provide: NotificationsService, useValue: createMockNotifications() },
    ]);

    authService = ctx.module.get(AuthService);

    // Add redis.expire used by auth rate limiting (not in base createMockRedis)
    (ctx.redis as any).expire = jest.fn().mockResolvedValue(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 1: Register -> login -> get profile
  // ──────────────────────────────────────────────────────────────────────

  it('should register a user, then login with same credentials', async () => {
    const email = 'newuser@pawmate.test';
    const password = 'SecurePass1';

    // ── Register phase ──────────────────────────────────────────────────

    // No existing user
    ctx.prisma.user.findUnique.mockResolvedValueOnce(null);

    const createdUser = createUser({
      id: 'new-user-1',
      email,
      firstName: 'Ahmed',
      lastName: 'Hassan',
      roles: ['PARENT'],
      emailVerified: false,
    });
    ctx.prisma.user.create.mockResolvedValue(createdUser);

    // Token storage mocks
    ctx.prisma.refreshToken.count.mockResolvedValue(0);
    ctx.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

    const registerResult = await authService.register({
      firstName: 'Ahmed',
      lastName: 'Hassan',
      email,
      password,
    });

    expect(registerResult.accessToken).toBeDefined();
    expect(registerResult.refreshToken).toBeDefined();
    expect(registerResult.user.email).toBe(email);

    // ── Login phase ─────────────────────────────────────────────────────

    const userWithHash = {
      ...createdUser,
      passwordHash: await bcrypt.hash(password, 12),
      isBanned: false,
      isActive: true,
    };
    ctx.prisma.user.findFirst.mockResolvedValueOnce(userWithHash);
    ctx.prisma.user.update.mockResolvedValue(userWithHash);
    ctx.prisma.refreshToken.count.mockResolvedValue(0);
    ctx.prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

    const loginResult = await authService.login({ email, password });

    expect(loginResult.accessToken).toBeDefined();
    expect(loginResult.user.id).toBe(createdUser.id);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 2: Login with wrong password rejected
  // ──────────────────────────────────────────────────────────────────────

  it('should reject login with wrong password', async () => {
    const user = createUser({
      id: 'user-wrong-pw',
      email: 'wrong@pawmate.test',
      passwordHash: await bcrypt.hash('CorrectPass1', 12),
      isBanned: false,
    });

    ctx.prisma.user.findFirst.mockResolvedValue(user);

    await expect(
      authService.login({ email: 'wrong@pawmate.test', password: 'WrongPass1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 3: Role enforcement - admin required
  // ──────────────────────────────────────────────────────────────────────

  it('should deny addRole with an invalid role string', async () => {
    const user = createUser({ id: 'user-role-test', roles: ['PARENT'] });
    ctx.prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      authService.addRole(user.id as string, 'SUPER_ADMIN'),
    ).rejects.toThrow(BadRequestException);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 4: Password reset flow
  // ──────────────────────────────────────────────────────────────────────

  it('should execute forgot password -> reset password flow', async () => {
    const user = createUser({
      id: 'user-reset-1',
      email: 'reset@pawmate.test',
      authProvider: 'email',
    });

    // ── forgotPassword ──────────────────────────────────────────────────

    // Mock rate limit counter (first call)
    ctx.redis.incr.mockResolvedValueOnce(1);

    ctx.prisma.user.findUnique.mockResolvedValueOnce(user);

    const forgotResult = await authService.forgotPassword('reset@pawmate.test');
    expect(forgotResult.message).toContain('reset link has been sent');

    // Verify a token was stored in Redis
    expect(ctx.redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^forgot:/),
      3600,
      user.id,
    );

    // Extract the token that was stored
    const setexCall = ctx.redis.setex.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('forgot:'),
    );
    const resetToken = (setexCall[0] as string).replace('forgot:', '');

    // ── resetPassword ───────────────────────────────────────────────────

    // Redis returns the userId for this token
    ctx.redis.get.mockResolvedValueOnce(user.id);
    ctx.prisma.user.update.mockResolvedValue(user);
    ctx.prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const resetResult = await authService.resetPassword(resetToken, 'NewSecure1');
    expect(resetResult.message).toContain('Password reset successfully');

    // Token was deleted
    expect(ctx.redis.del).toHaveBeenCalledWith(`forgot:${resetToken}`);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Test 5: Investor route protection
  // ──────────────────────────────────────────────────────────────────────

  it('should deny access to investor guard without INVESTOR role', async () => {
    const regularUser = createUser({ id: 'non-investor', roles: ['PARENT'], role: 'user' });

    // Create a standalone guard instance with the mocked prisma
    const guard = new InvestorGuard(ctx.prisma as any);

    ctx.prisma.user.findUnique.mockResolvedValue(regularUser);

    // Mock ExecutionContext
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: regularUser.id },
        }),
      }),
    } as any;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
  });

  it('should allow access to investor guard with INVESTOR role', async () => {
    const investor = createInvestor({ id: 'investor-1' });

    const guard = new InvestorGuard(ctx.prisma as any);

    ctx.prisma.user.findUnique.mockResolvedValue(investor);

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: investor.id },
        }),
      }),
    } as any;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
