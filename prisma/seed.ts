/**
 * PawMate Egypt - Comprehensive Database Seed
 * Covers ALL booking types in ALL states with realistic test data
 * Run: npx ts-node --project tsconfig.json prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Date helpers
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const today = () => new Date();

async function main() {
  console.log('Starting PawMate Egypt comprehensive seed...');

  // ============================================================
  // ADMIN USER
  // ============================================================
  const adminHash = await bcrypt.hash('Admin@123!', 12);
  const admin = await prisma.user.upsert({
    where: { phone: '+201000000000' },
    update: {},
    create: {
      phone: '+201000000000',
      email: 'admin@pawmate.eg',
      passwordHash: adminHash,
      firstName: 'Admin',
      lastName: 'PawMate',
      role: 'admin',
      idVerified: true,
      isOwner: false,
      isSitter: false,
      phoneVerified: true,
    },
  });
  console.log('Admin created:', admin.phone);

  // ============================================================
  // USERS
  // ============================================================

  // Owner 1 - Ali Farrag (main test user)
  const aliHash = await bcrypt.hash('Test1234!', 12);
  const ali = await prisma.user.upsert({
    where: { phone: '+201099999999' },
    update: {
      walletBalance: 500.00,
      email: 'ali@pawmate.eg',
    },
    create: {
      phone: '+201099999999',
      email: 'ali@pawmate.eg',
      passwordHash: aliHash,
      firstName: 'Ali',
      lastName: 'Farrag',
      isOwner: true,
      isSitter: false,
      activeRole: 'owner',
      phoneVerified: true,
      walletBalance: 500.00,
    },
  });
  console.log('Owner 1 (Ali Farrag) created:', ali.phone);

  // Owner 2 - Fatima Ahmed (dual role)
  const fatimaHash = await bcrypt.hash('Owner1234!', 12);
  const fatima = await prisma.user.upsert({
    where: { phone: '+201012345678' },
    update: {
      walletBalance: 750.00,
      email: 'fatima@pawmate.eg',
    },
    create: {
      phone: '+201012345678',
      email: 'fatima@pawmate.eg',
      passwordHash: fatimaHash,
      firstName: 'Fatima',
      lastName: 'Ahmed',
      isOwner: true,
      isSitter: true,
      activeRole: 'owner',
      phoneVerified: true,
      walletBalance: 750.00,
    },
  });
  console.log('Owner 2 (Fatima Ahmed) created:', fatima.phone);

  // Sitter 1 - Sara Mohamed (dog walking, drop-in)
  const saraHash = await bcrypt.hash('Sitter1234!', 12);
  const sara = await prisma.user.upsert({
    where: { phone: '+201076543210' },
    update: {
      walletBalance: 1200.00,
      idVerified: true,
      email: 'sara@pawmate.eg',
    },
    create: {
      phone: '+201076543210',
      email: 'sara@pawmate.eg',
      passwordHash: saraHash,
      firstName: 'Sara',
      lastName: 'Mohamed',
      isOwner: true,
      isSitter: true,
      activeRole: 'sitter',
      phoneVerified: true,
      idVerified: true,
      walletBalance: 1200.00,
    },
  });
  console.log('Sitter 1 (Sara Mohamed) created:', sara.phone);

  // Sitter 2 - Omar Khalil (boarding, house sitting)
  const omarHash = await bcrypt.hash('Sitter1234!', 12);
  const omar = await prisma.user.upsert({
    where: { phone: '+201112233440' },
    update: {
      walletBalance: 800.00,
      idVerified: true,
      email: 'omar@pawmate.eg',
    },
    create: {
      phone: '+201112233440',
      email: 'omar@pawmate.eg',
      passwordHash: omarHash,
      firstName: 'Omar',
      lastName: 'Khalil',
      isOwner: false,
      isSitter: true,
      activeRole: 'sitter',
      phoneVerified: true,
      idVerified: true,
      walletBalance: 800.00,
    },
  });
  console.log('Sitter 2 (Omar Khalil) created:', omar.phone);

  // Sitter 3 - Nour Hassan (daycare)
  const nourHash = await bcrypt.hash('Sitter1234!', 12);
  const nour = await prisma.user.upsert({
    where: { phone: '+201223344550' },
    update: {
      walletBalance: 950.00,
      idVerified: true,
      email: 'nour@pawmate.eg',
    },
    create: {
      phone: '+201223344550',
      email: 'nour@pawmate.eg',
      passwordHash: nourHash,
      firstName: 'Nour',
      lastName: 'Hassan',
      isOwner: false,
      isSitter: true,
      activeRole: 'sitter',
      phoneVerified: true,
      idVerified: true,
      walletBalance: 950.00,
    },
  });
  console.log('Sitter 3 (Nour Hassan) created:', nour.phone);

  // ============================================================
  // SITTER PROFILES
  // ============================================================

  // Sara's profile
  const saraProfile = await prisma.sitterProfile.upsert({
    where: { userId: sara.id },
    update: {
      avgRating: 4.8,
      totalReviews: 23,
      totalBookings: 28,
    },
    create: {
      userId: sara.id,
      bio: 'Cairo-based animal lover with 5 years experience. Specialized in dog walking and drop-in visits across Heliopolis and Nasr City.',
      experienceYears: 5,
      services: ['dog_walking', 'drop_in'],
      petTypes: ['dog', 'cat'],
      petSizes: ['small', 'medium', 'large'],
      hourlyRate: 150,
      dailyRate: 600,
      lat: 30.0626,
      lng: 31.2497,
      addressDistrict: 'Heliopolis',
      addressCity: 'Cairo',
      avgRating: 4.8,
      totalReviews: 23,
      totalBookings: 28,
      isActive: true,
      isVerified: true,
      instantBook: true,
    },
  });
  console.log('Sara sitter profile created');

  // Omar's profile
  const omarProfile = await prisma.sitterProfile.upsert({
    where: { userId: omar.id },
    update: {
      avgRating: 4.9,
      totalReviews: 41,
      totalBookings: 45,
    },
    create: {
      userId: omar.id,
      bio: 'Experienced pet boarder in Maadi. Your pets get a real home-away-from-home experience with daily updates and photos.',
      experienceYears: 7,
      services: ['overnight_boarding', 'house_sitting', 'daycare'],
      petTypes: ['dog', 'cat', 'rabbit'],
      petSizes: ['small', 'medium', 'large', 'xlarge'],
      dailyRate: 700,
      lat: 29.9602,
      lng: 31.2569,
      addressDistrict: 'Maadi',
      addressCity: 'Cairo',
      avgRating: 4.9,
      totalReviews: 41,
      totalBookings: 45,
      isActive: true,
      isVerified: true,
    },
  });
  console.log('Omar sitter profile created');

  // Nour's profile
  const nourProfile = await prisma.sitterProfile.upsert({
    where: { userId: nour.id },
    update: {
      avgRating: 4.7,
      totalReviews: 15,
      totalBookings: 18,
    },
    create: {
      userId: nour.id,
      bio: 'Professional dog trainer and daycare provider in Zamalek. Small groups, lots of playtime and socialization.',
      experienceYears: 3,
      services: ['daycare', 'dog_walking', 'drop_in'],
      petTypes: ['dog', 'cat'],
      petSizes: ['small', 'medium', 'large'],
      hourlyRate: 130,
      dailyRate: 550,
      lat: 30.0614,
      lng: 31.2187,
      addressDistrict: 'Zamalek',
      addressCity: 'Cairo',
      avgRating: 4.7,
      totalReviews: 15,
      totalBookings: 18,
      isActive: true,
      isVerified: true,
    },
  });
  console.log('Nour sitter profile created');

  // ============================================================
  // PETS
  // ============================================================

  // Ali's pet - Max (dog)
  const maxPet = await prisma.pet.upsert({
    where: { id: 'seed-pet-max-ali' },
    update: {},
    create: {
      id: 'seed-pet-max-ali',
      ownerId: ali.id,
      name: 'Max',
      species: 'dog',
      breed: 'Golden Retriever',
      weightKg: 28.5,
      weightCategory: 'large',
      gender: 'male',
      photos: ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=400'],
    },
  });
  console.log('Pet Max (Ali) created');

  // Ali's pet - Luna (cat)
  const lunaPet = await prisma.pet.upsert({
    where: { id: 'seed-pet-luna-ali' },
    update: {},
    create: {
      id: 'seed-pet-luna-ali',
      ownerId: ali.id,
      name: 'Luna',
      species: 'cat',
      breed: 'Persian',
      weightKg: 4.2,
      weightCategory: 'small',
      gender: 'female',
      photos: ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400'],
    },
  });
  console.log('Pet Luna (Ali) created');

  // Fatima's pet - Buddy (dog, Husky)
  const buddyPet = await prisma.pet.upsert({
    where: { id: 'seed-pet-buddy-fatima' },
    update: {},
    create: {
      id: 'seed-pet-buddy-fatima',
      ownerId: fatima.id,
      name: 'Buddy',
      species: 'dog',
      breed: 'Husky',
      weightKg: 22.0,
      weightCategory: 'large',
      gender: 'male',
      photos: ['https://images.unsplash.com/photo-1605568427561-40dd23c2acea?w=400'],
    },
  });
  console.log('Pet Buddy (Fatima) created');

  // ============================================================
  // BOOKINGS
  // ============================================================
  // NOTE: Booking.sitterId references User.id (not SitterProfile.id)
  // PaymentMethod enum: platform_wallet, card, mobile_wallet, fawry
  // BookingStatus: pending, accepted, active, completed, cancelled, disputed, no_sitters_available

  // Booking 1 - COMPLETED dog walk (Ali -> Sara, Max, 3 days ago)
  const booking1 = await prisma.booking.upsert({
    where: { id: 'seed-booking-1' },
    update: {},
    create: {
      id: 'seed-booking-1',
      ownerId: ali.id,
      sitterId: sara.id,
      bookingType: 'hourly',
      serviceType: 'dog_walking',
      status: 'completed',
      requestedStart: daysAgo(3),
      requestedEnd: daysAgo(3),
      actualStart: daysAgo(3),
      actualEnd: daysAgo(3),
      serviceLocationType: 'owner_home',
      basePrice: 150,
      commissionRate: 15.00,
      commissionAmount: 22.50,
      totalPrice: 150,
      sitterPayout: 127.50,
      paymentStatus: 'captured',
      paymentMethod: 'platform_wallet',
      ownerReviewed: true,
      sitterReviewed: true,
    },
  });
  console.log('Booking 1 created (completed dog walk)');

  // Link pet to booking 1
  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking1.id, petId: maxPet.id } },
    update: {},
    create: { bookingId: booking1.id, petId: maxPet.id },
  });

  // Booking 2 - COMPLETED overnight boarding (Ali -> Omar, Max, 7-5 days ago)
  const booking2 = await prisma.booking.upsert({
    where: { id: 'seed-booking-2' },
    update: {},
    create: {
      id: 'seed-booking-2',
      ownerId: ali.id,
      sitterId: omar.id,
      bookingType: 'daily',
      serviceType: 'overnight_boarding',
      status: 'completed',
      requestedStart: daysAgo(7),
      requestedEnd: daysAgo(5),
      actualStart: daysAgo(7),
      actualEnd: daysAgo(5),
      serviceLocationType: 'sitter_home',
      basePrice: 1400,
      commissionRate: 15.00,
      commissionAmount: 210,
      totalPrice: 1400,
      sitterPayout: 1190,
      paymentStatus: 'captured',
      paymentMethod: 'platform_wallet',
      ownerReviewed: true,
      sitterReviewed: true,
    },
  });
  console.log('Booking 2 created (completed overnight boarding)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking2.id, petId: maxPet.id } },
    update: {},
    create: { bookingId: booking2.id, petId: maxPet.id },
  });

  // Booking 3 - ACCEPTED upcoming daycare (Ali -> Nour, Luna, tomorrow)
  const booking3 = await prisma.booking.upsert({
    where: { id: 'seed-booking-3' },
    update: {},
    create: {
      id: 'seed-booking-3',
      ownerId: ali.id,
      sitterId: nour.id,
      bookingType: 'daily',
      serviceType: 'daycare',
      status: 'accepted',
      requestedStart: daysFromNow(1),
      requestedEnd: daysFromNow(1),
      serviceLocationType: 'sitter_home',
      basePrice: 550,
      commissionRate: 15.00,
      commissionAmount: 82.50,
      totalPrice: 550,
      sitterPayout: 467.50,
      paymentStatus: 'authorized',
      paymentMethod: 'platform_wallet',
    },
  });
  console.log('Booking 3 created (accepted daycare, tomorrow)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking3.id, petId: lunaPet.id } },
    update: {},
    create: { bookingId: booking3.id, petId: lunaPet.id },
  });

  // Booking 4 - PENDING house sitting request (Ali -> Omar, Max, 5-8 days from now)
  const booking4 = await prisma.booking.upsert({
    where: { id: 'seed-booking-4' },
    update: {},
    create: {
      id: 'seed-booking-4',
      ownerId: ali.id,
      sitterId: omar.id,
      bookingType: 'daily',
      serviceType: 'house_sitting',
      status: 'pending',
      requestedStart: daysFromNow(5),
      requestedEnd: daysFromNow(8),
      serviceLocationType: 'owner_home',
      basePrice: 2100,
      commissionRate: 15.00,
      commissionAmount: 315,
      totalPrice: 2100,
      sitterPayout: 1785,
      paymentStatus: 'pending',
      paymentMethod: 'platform_wallet',
    },
  });
  console.log('Booking 4 created (pending house sitting)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking4.id, petId: maxPet.id } },
    update: {},
    create: { bookingId: booking4.id, petId: maxPet.id },
  });

  // Booking 5 - ACTIVE dog walk (Fatima -> Sara, Buddy, today)
  const booking5 = await prisma.booking.upsert({
    where: { id: 'seed-booking-5' },
    update: {},
    create: {
      id: 'seed-booking-5',
      ownerId: fatima.id,
      sitterId: sara.id,
      bookingType: 'hourly',
      serviceType: 'dog_walking',
      status: 'active',
      requestedStart: today(),
      requestedEnd: today(),
      actualStart: today(),
      serviceLocationType: 'owner_home',
      basePrice: 150,
      commissionRate: 15.00,
      commissionAmount: 22.50,
      totalPrice: 150,
      sitterPayout: 127.50,
      paymentStatus: 'authorized',
      paymentMethod: 'mobile_wallet',
    },
  });
  console.log('Booking 5 created (active dog walk - Fatima/Sara)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking5.id, petId: buddyPet.id } },
    update: {},
    create: { bookingId: booking5.id, petId: buddyPet.id },
  });

  // Booking 6 - PENDING drop-in (Ali -> Nour, Luna, 2 days from now)
  const booking6 = await prisma.booking.upsert({
    where: { id: 'seed-booking-6' },
    update: {},
    create: {
      id: 'seed-booking-6',
      ownerId: ali.id,
      sitterId: nour.id,
      bookingType: 'hourly',
      serviceType: 'drop_in',
      status: 'pending',
      requestedStart: daysFromNow(2),
      requestedEnd: daysFromNow(2),
      serviceLocationType: 'owner_home',
      basePrice: 130,
      commissionRate: 15.00,
      commissionAmount: 19.50,
      totalPrice: 130,
      sitterPayout: 110.50,
      paymentStatus: 'pending',
      paymentMethod: 'mobile_wallet',
    },
  });
  console.log('Booking 6 created (pending drop-in - Ali/Nour)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking6.id, petId: lunaPet.id } },
    update: {},
    create: { bookingId: booking6.id, petId: lunaPet.id },
  });

  // Bonus Booking 7 - CANCELLED (Ali -> Sara, Max)
  const booking7 = await prisma.booking.upsert({
    where: { id: 'seed-booking-7' },
    update: {},
    create: {
      id: 'seed-booking-7',
      ownerId: ali.id,
      sitterId: sara.id,
      bookingType: 'hourly',
      serviceType: 'dog_walking',
      status: 'cancelled',
      requestedStart: daysAgo(10),
      requestedEnd: daysAgo(10),
      serviceLocationType: 'owner_home',
      basePrice: 150,
      commissionRate: 15.00,
      commissionAmount: 22.50,
      totalPrice: 150,
      sitterPayout: 127.50,
      paymentStatus: 'refunded',
      paymentMethod: 'platform_wallet',
      cancelledById: ali.id,
      cancelledAt: daysAgo(11),
      cancellationReason: 'Change of plans',
      cancellationType: 'owner_24h_plus',
    },
  });
  console.log('Booking 7 created (cancelled dog walk)');

  await prisma.bookingPet.upsert({
    where: { bookingId_petId: { bookingId: booking7.id, petId: maxPet.id } },
    update: {},
    create: { bookingId: booking7.id, petId: maxPet.id },
  });

  // ============================================================
  // PAYMENT TRANSACTIONS
  // ============================================================

  // Ali - wallet top-ups
  await prisma.paymentTransaction.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-txn-ali-topup-1',
        userId: ali.id,
        type: 'top_up',
        amount: 1500,
        direction: 'credit',
        status: 'success',
        gateway: 'paymob',
        processedAt: daysAgo(14),
        createdAt: daysAgo(14),
      },
      {
        id: 'seed-txn-ali-topup-2',
        userId: ali.id,
        type: 'top_up',
        amount: 500,
        direction: 'credit',
        status: 'success',
        gateway: 'paymob',
        processedAt: daysAgo(10),
        createdAt: daysAgo(10),
      },
      // Ali - booking payment for boarding (7 days ago)
      {
        id: 'seed-txn-ali-boarding',
        userId: ali.id,
        bookingId: booking2.id,
        type: 'booking_payment',
        amount: 1400,
        direction: 'debit',
        status: 'success',
        gateway: 'platform',
        processedAt: daysAgo(7),
        createdAt: daysAgo(7),
      },
      // Ali - booking payment for dog walk (3 days ago)
      {
        id: 'seed-txn-ali-walk',
        userId: ali.id,
        bookingId: booking1.id,
        type: 'booking_payment',
        amount: 150,
        direction: 'debit',
        status: 'success',
        gateway: 'platform',
        processedAt: daysAgo(3),
        createdAt: daysAgo(3),
      },
    ],
  });
  console.log('Ali payment transactions created');

  // Sara - payout (earnings from completed walk)
  await prisma.paymentTransaction.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-txn-sara-payout',
        userId: sara.id,
        bookingId: booking1.id,
        type: 'payout',
        amount: 127.50,
        direction: 'credit',
        status: 'success',
        gateway: 'platform',
        processedAt: daysAgo(3),
        createdAt: daysAgo(3),
      },
    ],
  });
  console.log('Sara payment transactions created');

  // Omar - payout (earnings from completed boarding)
  await prisma.paymentTransaction.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-txn-omar-payout',
        userId: omar.id,
        bookingId: booking2.id,
        type: 'payout',
        amount: 1190,
        direction: 'credit',
        status: 'success',
        gateway: 'platform',
        processedAt: daysAgo(5),
        createdAt: daysAgo(5),
      },
    ],
  });
  console.log('Omar payment transactions created');

  // ============================================================
  // REVIEWS (for completed bookings)
  // ============================================================

  // Review for Sara from Ali (dog walking)
  await prisma.review.upsert({
    where: { id: 'seed-review-sara-from-ali' },
    update: {},
    create: {
      id: 'seed-review-sara-from-ali',
      bookingId: booking1.id,
      reviewerId: ali.id,
      revieweeId: sara.id,
      revieweeType: 'sitter',
      overallRating: 5.0,
      ratingCommunication: 5.0,
      ratingReliability: 5.0,
      ratingCareQuality: 5.0,
      ratingValue: 5.0,
      comment: 'Sara is absolutely amazing! Max came home happy and tired after a great walk. She sent updates throughout. Highly recommended!',
      wouldRebook: true,
      isPublished: true,
      publishedAt: daysAgo(3),
    },
  });

  // Review for Omar from Ali (overnight boarding)
  await prisma.review.upsert({
    where: { id: 'seed-review-omar-from-ali' },
    update: {},
    create: {
      id: 'seed-review-omar-from-ali',
      bookingId: booking2.id,
      reviewerId: ali.id,
      revieweeId: omar.id,
      revieweeType: 'sitter',
      overallRating: 5.0,
      ratingCommunication: 5.0,
      ratingReliability: 5.0,
      ratingCareQuality: 5.0,
      ratingValue: 5.0,
      comment: 'Omar took amazing care of Max during the overnight stay. Daily photo updates and Max loved it. Will definitely book again!',
      wouldRebook: true,
      isPublished: true,
      publishedAt: daysAgo(5),
    },
  });

  console.log('Reviews created');

  // ============================================================
  // SITTER PAYOUTS
  // ============================================================

  await prisma.petFriendPayout.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-payout-sara-1',
        petFriendId: sara.id,
        bookingId: booking1.id,
        amount: 127.50,
        payoutMethod: 'vodafone_cash',
        status: 'completed',
        netEgp: 128,
        processedAt: daysAgo(3),
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      },
      {
        id: 'seed-payout-omar-1',
        petFriendId: omar.id,
        bookingId: booking2.id,
        amount: 1190,
        payoutMethod: 'bank_transfer',
        status: 'completed',
        netEgp: 1190,
        processedAt: daysAgo(5),
        createdAt: daysAgo(5),
        updatedAt: daysAgo(5),
      },
    ],
  });
  console.log('PetFriend payouts created');

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  await prisma.notification.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-notif-1',
        userId: ali.id,
        type: 'booking_completed',
        title: 'Walk complete!',
        body: 'Your dog walk with Sara Mohamed is complete. Rate your experience!',
        isRead: true,
        createdAt: daysAgo(3),
      },
      {
        id: 'seed-notif-2',
        userId: ali.id,
        type: 'booking_completed',
        title: 'Boarding complete!',
        body: 'Max is back home! Rate your experience with Omar Khalil.',
        isRead: true,
        createdAt: daysAgo(5),
      },
      {
        id: 'seed-notif-3',
        userId: ali.id,
        type: 'booking_confirmed',
        title: 'Daycare confirmed!',
        body: 'Your daycare booking with Nour Hassan for tomorrow is confirmed.',
        isRead: false,
        createdAt: daysAgo(1),
      },
      {
        id: 'seed-notif-4',
        userId: sara.id,
        type: 'booking_request',
        title: 'New booking request!',
        body: 'Fatima Ahmed has requested a dog walk for today.',
        isRead: false,
        createdAt: today(),
      },
      {
        id: 'seed-notif-5',
        userId: nour.id,
        type: 'booking_request',
        title: 'New booking request!',
        body: 'Ali Farrag has requested a drop-in visit for Luna.',
        isRead: false,
        createdAt: today(),
      },
    ],
  });
  console.log('Notifications created');

  // ============================================================
  // PRINT SUMMARY
  // ============================================================
  console.log('');
  console.log('============================================================');
  console.log('               PawMate Egypt - Seed Complete!               ');
  // ============================================================
  // PRICING BOUNDS
  // ============================================================
  const pricingBoundsData = [
    { serviceType: 'HOUR',  minEgp: 50,  defaultMaxEgp: 200,  eliteMaxEgp: 400 },
    { serviceType: 'DAY',   minEgp: 150, defaultMaxEgp: 600,  eliteMaxEgp: 1200 },
    { serviceType: 'NIGHT', minEgp: 200, defaultMaxEgp: 800,  eliteMaxEgp: 1500 },
    { serviceType: 'WALK',  minEgp: 50,  defaultMaxEgp: 150,  eliteMaxEgp: 300 },
    // Trainer service pricing bounds (Prompt 9)
    { serviceType: 'TRAINING_SESSION_1HR',  minEgp: 150,  defaultMaxEgp: 500,   eliteMaxEgp: 1200 },
    { serviceType: 'TRAINING_SESSION_2HR',  minEgp: 250,  defaultMaxEgp: 900,   eliteMaxEgp: 2200 },
    { serviceType: 'TRAINING_PACKAGE_6',    minEgp: 800,  defaultMaxEgp: 2500,  eliteMaxEgp: 6000 },
    { serviceType: 'TRAINING_PROGRAM_8WK',  minEgp: 2500, defaultMaxEgp: 8000,  eliteMaxEgp: 18000 },
    { serviceType: 'BEHAVIOR_ASSESSMENT',   minEgp: 200,  defaultMaxEgp: 600,   eliteMaxEgp: 1500 },
  ];
  for (const bound of pricingBoundsData) {
    await prisma.pricingBounds.upsert({
      where: { serviceType: bound.serviceType },
      update: bound,
      create: bound,
    });
  }
  console.log('PricingBounds seeded: HOUR min=50 max=200/400 | DAY min=150 max=600/1200 | NIGHT min=200 max=800/1500 | WALK min=50 max=150/300');

  console.log('============================================================');
  console.log('');
  console.log('=== User Credentials ===');
  console.log('Admin:    +201000000000  / Admin@123!');
  console.log('');
  console.log('--- Owners ---');
  console.log('Ali Farrag (main):  +201099999999  / Test1234!   wallet: 500 EGP');
  console.log('Fatima Ahmed:       +201012345678  / Owner1234!  wallet: 750 EGP');
  console.log('');
  console.log('--- Sitters ---');
  console.log('Sara Mohamed:  +201076543210  / Sitter1234!  wallet: 1200 EGP  (dog walking, drop-in)');
  console.log('Omar Khalil:   +201112233440  / Sitter1234!  wallet: 800 EGP   (boarding, house sitting)');
  console.log('Nour Hassan:   +201223344550  / Sitter1234!  wallet: 950 EGP   (daycare)');
  console.log('');
  console.log('=== Pets ===');
  console.log('Max  (Ali)    - Golden Retriever, 3yo, 28.5kg');
  console.log('Luna (Ali)    - Persian Cat, 2yo, 4.2kg');
  console.log('Buddy (Fatima) - Husky, 22kg');
  console.log('');
  console.log('=== Bookings ===');
  console.log('Booking 1: COMPLETED dog walk      - Ali -> Sara  (Max,  3 days ago,  150 EGP wallet)');
  console.log('Booking 2: COMPLETED boarding       - Ali -> Omar  (Max,  7-5 days ago, 1400 EGP wallet)');
  console.log('Booking 3: ACCEPTED daycare         - Ali -> Nour  (Luna, tomorrow,    550 EGP wallet)');
  console.log('Booking 4: PENDING house sitting    - Ali -> Omar  (Max,  5-8 days,    2100 EGP wallet)');
  console.log('Booking 5: ACTIVE dog walk          - Fatima -> Sara (Buddy, today,    150 EGP)');
  console.log('Booking 6: PENDING drop-in          - Ali -> Nour  (Luna, 2 days,      130 EGP)');
  console.log('Booking 7: CANCELLED dog walk       - Ali -> Sara  (Max,  10 days ago, 150 EGP)');
  console.log('');
  console.log('=== Reviews ===');
  console.log('Ali -> Sara: 5/5 stars (dog walking)');
  console.log('Ali -> Omar: 5/5 stars (overnight boarding)');
  console.log('');
  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
