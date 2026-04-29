import { randomUUID } from 'crypto';

export function createPetFriendProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    bio: 'Experienced pet carer with 5 years of experience.',
    experienceLevel: '5_plus',
    languagesSpoken: ['Arabic', 'English'],
    serviceTypes: ['boarding', 'dog_walking'],
    acceptsDogs: true,
    acceptsCats: true,
    maxPetsPerBooking: 3,
    addressCity: 'Cairo',
    serviceRadiusKm: 10,
    status: 'APPROVED',
    isActive: true,
    autoApprovedAt: new Date(),
    profilePhotoUrl: 'https://res.cloudinary.com/test/photo.jpg',
    nationalIdFrontUrl: 'https://res.cloudinary.com/test/id-front.jpg',
    nationalIdBackUrl: 'https://res.cloudinary.com/test/id-back.jpg',
    selfieWithIdUrl: 'https://res.cloudinary.com/test/selfie.jpg',
    pccUrl: 'https://res.cloudinary.com/test/pcc.pdf',
    avgRating: 4.5,
    totalReviews: 10,
    totalBookings: 15,
    commissionRate: 0.15,
    rates: { boarding: 150, dog_walking: 75 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createPendingPetFriend(overrides: Partial<Record<string, unknown>> = {}) {
  return createPetFriendProfile({
    status: 'PENDING_DOCS',
    autoApprovedAt: null,
    pccUrl: null,
    avgRating: 0,
    totalReviews: 0,
    totalBookings: 0,
    ...overrides,
  });
}
