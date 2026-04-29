import { randomUUID } from 'crypto';

export function createBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    parentId: randomUUID(),
    petFriendId: randomUUID(),
    petFriendProfileId: randomUUID(),
    serviceType: 'dog_walking',
    status: 'pending',
    requestedStart: new Date('2026-05-01T09:00:00Z'),
    requestedEnd: new Date('2026-05-01T10:00:00Z'),
    totalPrice: 150,
    commissionRate: 0.15,
    commissionAmount: 22.5,
    providerPayout: 127.5,
    paymentStatus: 'pending',
    parentReviewed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createCompletedBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return createBooking({
    status: 'completed',
    paymentStatus: 'paid',
    actualStart: new Date('2026-05-01T09:00:00Z'),
    actualEnd: new Date('2026-05-01T10:00:00Z'),
    completedAt: new Date(),
    ...overrides,
  });
}
