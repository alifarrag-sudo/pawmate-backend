import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  /**
   * Build an ExecutionContext stub with the new JWT-derived session shape:
   *   request.user = { id, email, roles, activeRole }
   * (was previously { sub: userId } — fixed in JWT identity contract migration)
   */
  const createMockContext = (sessionUser?: { id?: string; roles?: string[] }) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        user: sessionUser ?? undefined,
      }),
    }),
  });

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('throws ForbiddenException when no user on request', async () => {
    const ctx = createMockContext();
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no id', async () => {
    const ctx = createMockContext({ roles: ['admin'] });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('allows when roles array contains admin', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: ['admin'] });
    expect(await guard.canActivate(ctx as any)).toBe(true);
  });

  it('allows when roles array contains owner', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: ['owner'] });
    expect(await guard.canActivate(ctx as any)).toBe(true);
  });

  it('allows when roles array contains owner_restricted', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: ['owner_restricted'] });
    expect(await guard.canActivate(ctx as any)).toBe(true);
  });

  it('allows when admin role coexists with other roles', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: ['PARENT', 'admin'] });
    expect(await guard.canActivate(ctx as any)).toBe(true);
  });

  it('rejects when roles array contains only non-admin roles', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: ['PARENT', 'PETFRIEND'] });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when roles array is empty', async () => {
    const ctx = createMockContext({ id: 'user-123', roles: [] });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when roles is missing entirely', async () => {
    const ctx = createMockContext({ id: 'user-123' });
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
  });
});
