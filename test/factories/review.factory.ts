import { randomUUID } from 'crypto';

export function createReview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    bookingId: randomUUID(),
    reviewerId: randomUUID(),
    providerUserId: randomUUID(),
    providerType: 'PETFRIEND',
    providerProfileId: randomUUID(),
    rating: 5,
    overallRating: 5,
    comment: 'Great service!',
    tags: ['punctual', 'great_with_pets'],
    isVisible: true,
    isFlagged: false,
    isPublished: true,
    moderationAction: null,
    replyStatus: 'NO_REPLY',
    replyDraftText: null,
    replyText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
