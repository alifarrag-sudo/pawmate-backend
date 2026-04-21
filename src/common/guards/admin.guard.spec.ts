import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let mockPrisma: any;
  let mockRedis: any;

  const createMockContext = (userId?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId ? { sub: userId } : undefined,
      }),
    }),
  });

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };
    guard = new AdminGuard(mockPrisma, mockRedis);
  });

  it('should throw ForbiddenException when no user on request', async () => {
    const ctx = createMockContext();
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('should allow admin role from cache', async () => {
    mockRedis.get.mockResolvedValue('admin');
    const ctx = createMockContext('user-123');
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('should allow owner role from cache', async () => {
    mockRedis.get.mockResolvedValue('owner');
    const ctx = createMockContext('user-123');
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  it('should allow owner_restricted role from cache', async () => {
    mockRedis.get.mockResolvedValue('owner_restricted');
    const ctx = createMockContext('user-123');
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
  });

  it('should reject non-admin role from cache', async () => {
    mockRedis.get.mockResolvedValue('user');
    const ctx = createMockContext('user-123');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('should query DB on cache miss and allow admin', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });
    const ctx = createMockContext('user-123');
    const result = await guard.canActivate(ctx as any);
    expect(result).toBe(true);
    expect(mockRedis.setex).toHaveBeenCalledWith('user:role:user-123', 60, 'admin');
  });

  it('should query DB on cache miss and reject regular user', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'user' });
    const ctx = createMockContext('user-123');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
    expect(mockRedis.setex).toHaveBeenCalledWith('user:role:user-123', 60, 'user');
  });

  it('should reject when user not found in DB', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const ctx = createMockContext('user-123');
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });
});
