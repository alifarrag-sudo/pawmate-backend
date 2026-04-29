import { randomUUID } from 'crypto';

export function createUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    email: `test-${Date.now()}@pawmate.test`,
    firstName: 'Test',
    lastName: 'User',
    phone: '+201001234567',
    passwordHash: '$2b$12$fakehash',
    roles: ['PARENT'],
    activeRole: 'PARENT',
    role: 'user',
    isActive: true,
    isBanned: false,
    isParent: true,
    emailVerified: true,
    idVerified: false,
    referralCode: 'TST123',
    accountCreditEgp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function createAdmin(overrides: Partial<Record<string, unknown>> = {}) {
  return createUser({
    role: 'admin',
    roles: ['ADMIN'],
    activeRole: 'ADMIN',
    isParent: false,
    ...overrides,
  });
}

export function createInvestor(overrides: Partial<Record<string, unknown>> = {}) {
  return createUser({
    roles: ['INVESTOR'],
    activeRole: 'INVESTOR',
    isParent: false,
    ...overrides,
  });
}
