-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "ActiveRole" AS ENUM ('parent', 'petfriend');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('dog', 'cat', 'bird', 'rabbit', 'reptile', 'fish', 'hamster', 'guinea_pig', 'other');

-- CreateEnum
CREATE TYPE "PetGender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "WeightCategory" AS ENUM ('small', 'medium', 'large', 'xlarge');

-- CreateEnum
CREATE TYPE "MedicationFrequency" AS ENUM ('once_daily', 'twice_daily', 'three_daily', 'four_daily', 'every_other_day', 'weekly', 'as_needed');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('feeding', 'walk', 'medication', 'grooming', 'other');

-- CreateEnum
CREATE TYPE "AgeCategory" AS ENUM ('puppy', 'young', 'adult', 'senior');

-- CreateEnum
CREATE TYPE "NeuteredStatus" AS ENUM ('yes', 'no', 'unknown');

-- CreateEnum
CREATE TYPE "HouseTrainedStatus" AS ENUM ('yes', 'no', 'working_on_it');

-- CreateEnum
CREATE TYPE "EnergyLevel" AS ENUM ('low', 'medium', 'high', 'very_high');

-- CreateEnum
CREATE TYPE "MedicationType" AS ENUM ('pill', 'topical', 'injection', 'other');

-- CreateEnum
CREATE TYPE "CareActionType" AS ENUM ('walk', 'meal', 'medication');

-- CreateEnum
CREATE TYPE "BehaviorCompatibility" AS ENUM ('yes', 'no', 'with_supervision');

-- CreateEnum
CREATE TYPE "TrainingLevel" AS ENUM ('none', 'basic', 'advanced');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('dog_walking', 'pet_watching_hourly', 'pet_watching_daily', 'overnight_stay', 'trainer_session', 'kennel_boarding', 'pethotel_boarding');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'COUNTERED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('hourly', 'daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'accepted', 'active', 'ready_for_pickup', 'code_verified', 'completed', 'cancelled', 'disputed', 'no_providers_available');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WAIVED');

-- CreateEnum
CREATE TYPE "AdoptionStatus" AS ENUM ('available', 'pending', 'adopted');

-- CreateEnum
CREATE TYPE "CauseCategory" AS ENUM ('medical', 'rescue', 'shelter', 'food', 'spay_neuter', 'other');

-- CreateEnum
CREATE TYPE "CauseStatus" AS ENUM ('pending_approval', 'active', 'goal_reached', 'expired', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected', 'transferred');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('in_app', 'phone', 'both');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'captured', 'refunded', 'partially_refunded', 'failed', 'voided');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'mobile_wallet', 'fawry', 'platform_wallet');

-- CreateEnum
CREATE TYPE "ServiceLocationType" AS ENUM ('parent_home', 'petfriend_home', 'trainer_facility', 'kennel', 'pethotel', 'custom');

-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('parent_24h_plus', 'parent_24h_minus', 'parent_1h_minus', 'parent_noshow', 'petfriend_cancel', 'petfriend_noshow', 'admin_cancel');

-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('service_not_rendered', 'pet_injured', 'property_damage', 'late_no_show', 'overcharged', 'other');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved', 'appealed', 'closed');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('refund_parent', 'pay_petfriend', 'partial_resolution', 'no_action');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('feeding', 'walk', 'medication', 'grooming', 'check_in', 'other');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'completed', 'missed', 'skipped');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('booking_payment', 'payout', 'refund', 'top_up', 'commission', 'compensation', 'platform_credit', 'food_order_payment', 'food_order_earning');

-- CreateEnum
CREATE TYPE "FoodOrderStatus" AS ENUM ('placed', 'confirmed', 'rejected', 'ready_for_pickup', 'picked_up', 'cancelled');

-- CreateEnum
CREATE TYPE "FoodTargetAnimal" AS ENUM ('dog', 'cat', 'both', 'other');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'processing', 'success', 'failed');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('paymob', 'vodafone_cash', 'orange_cash', 'fawry', 'instapay', 'platform');

-- CreateEnum
CREATE TYPE "ProviderPayoutMethod" AS ENUM ('bank_transfer', 'vodafone_cash', 'orange_cash', 'platform_wallet');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "RevieweeType" AS ENUM ('parent', 'petfriend');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('approved', 'edited', 'removed');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('park', 'cafe', 'clinic', 'hotel', 'store', 'event_space', 'other');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('PETFRIEND', 'TRAINER', 'KENNEL', 'PETHOTEL', 'VET', 'GROOMER', 'PRODUCT_SELLER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WaitlistServiceType" AS ENUM ('VET', 'GROOMER', 'PRODUCTS');

-- CreateEnum
CREATE TYPE "TrainerOfferingType" AS ENUM ('SESSION', 'PACKAGE', 'COURSE', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "TrainerGroupSize" AS ENUM ('private_1on1', 'small_group', 'group_class');

-- CreateEnum
CREATE TYPE "TrainerSessionLocation" AS ENUM ('trainer_facility', 'parent_home', 'outdoor', 'virtual');

-- CreateEnum
CREATE TYPE "HomeType" AS ENUM ('apartment', 'house', 'villa');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "profilePhoto" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "authProvider" TEXT NOT NULL DEFAULT 'email',
    "authProviderId" TEXT,
    "roles" TEXT[] DEFAULT ARRAY['PARENT']::TEXT[],
    "isParent" BOOLEAN NOT NULL DEFAULT true,
    "isPetFriend" BOOLEAN NOT NULL DEFAULT false,
    "activeRole" "ActiveRole" NOT NULL DEFAULT 'parent',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "idVerified" BOOLEAN NOT NULL DEFAULT false,
    "idFrontUrl" TEXT,
    "idBackUrl" TEXT,
    "idSelfieUrl" TEXT,
    "idNumber" TEXT,
    "idReviewedAt" TIMESTAMP(3),
    "idReviewedById" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpiresAt" TIMESTAMP(3),
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "loyaltyTier" "LoyaltyTier" NOT NULL DEFAULT 'bronze',
    "walletBalance" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "outstandingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "language" "Language" NOT NULL DEFAULT 'ar',
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "providerType" "ProviderType",

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT,
    "deviceType" "DeviceType" NOT NULL,
    "deviceModel" TEXT,
    "appVersion" TEXT,
    "osVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_locations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_waitlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceType" "WaitlistServiceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_method_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_method_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petfriend_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "homeType" "HomeType",
    "hasYard" BOOLEAN NOT NULL DEFAULT false,
    "hasOtherPets" BOOLEAN NOT NULL DEFAULT false,
    "otherPetsDetails" TEXT,
    "hasChildren" BOOLEAN NOT NULL DEFAULT false,
    "childrenAges" TEXT,
    "placePhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "watchingHourlyRate" DECIMAL(8,2),
    "watchingDailyRate" DECIMAL(8,2),
    "overnightRate" DECIMAL(8,2),
    "walkRate30min" DECIMAL(8,2),
    "walkRate60min" DECIMAL(8,2),
    "overtimeRatePerHour" DECIMAL(8,2),
    "maxPetsSimultaneous" INTEGER NOT NULL DEFAULT 1,
    "petTypesAccepted" TEXT[],
    "petSizesAccepted" TEXT[],
    "lat" DECIMAL(10,8),
    "lng" DECIMAL(11,8),
    "serviceRadiusKm" INTEGER NOT NULL DEFAULT 5,
    "addressCity" TEXT,
    "addressDistrict" TEXT,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "responseRate" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "avgResponseMin" INTEGER NOT NULL DEFAULT 0,
    "reliabilityScore" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "cancellationRate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "instantBook" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnHoliday" BOOLEAN NOT NULL DEFAULT false,
    "holidayEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petfriend_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petfriend_availability_templates" (
    "id" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petfriend_availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petfriend_availability_overrides" (
    "id" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "overrideDate" DATE NOT NULL,
    "isAvailable" BOOLEAN NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petfriend_availability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petfriend_certifications" (
    "id" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "certName" TEXT NOT NULL,
    "issuedBy" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "documentUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petfriend_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "specializations" TEXT[],
    "methodsDescription" TEXT,
    "facilityPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoIntroUrl" TEXT,
    "bookingLeadHours" INTEGER NOT NULL DEFAULT 24,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "lat" DECIMAL(10,8),
    "lng" DECIMAL(11,8),
    "addressCity" TEXT,
    "addressDistrict" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_offerings" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "type" "TrainerOfferingType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "sessionLocation" "TrainerSessionLocation",
    "price" DECIMAL(8,2),
    "sessionsIncluded" INTEGER,
    "packageValidityDays" INTEGER,
    "weeksCount" INTEGER,
    "sessionsPerWeek" INTEGER,
    "groupSize" "TrainerGroupSize",
    "curriculum" TEXT,
    "startDate" DATE,
    "ongoingEnrollment" BOOLEAN NOT NULL DEFAULT false,
    "includedDetails" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_availability_templates" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kennel_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "commercialRegister" TEXT,
    "businessLicense" TEXT,
    "taxCardNumber" TEXT,
    "ownerName" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "district" TEXT,
    "lat" DECIMAL(10,8),
    "lng" DECIMAL(11,8),
    "facilityPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalCapacity" INTEGER,
    "operatingHours" JSONB,
    "daysOpen" TEXT[],
    "petTypesAccepted" TEXT[],
    "sizesAccepted" TEXT[],
    "amenities" TEXT[],
    "hasIsolationArea" BOOLEAN NOT NULL DEFAULT false,
    "emergencyVetName" TEXT,
    "emergencyVetPhone" TEXT,
    "standardRatePerNight" DECIMAL(8,2),
    "premiumRatePerNight" DECIMAL(8,2),
    "daycareRatePerDay" DECIMAL(8,2),
    "extraServices" JSONB,
    "pickupDropoffAvail" BOOLEAN NOT NULL DEFAULT false,
    "pickupDropoffPrice" DECIMAL(8,2),
    "vaccinesRequired" TEXT[],
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT false,
    "requiresTrialDay" BOOLEAN NOT NULL DEFAULT false,
    "minStayNights" INTEGER,
    "maxStayNights" INTEGER,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kennel_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pethotel_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "commercialRegister" TEXT,
    "businessLicense" TEXT,
    "taxCardNumber" TEXT,
    "ownerName" TEXT,
    "businessPhone" TEXT,
    "businessEmail" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "district" TEXT,
    "lat" DECIMAL(10,8),
    "lng" DECIMAL(11,8),
    "facilityPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalCapacity" INTEGER,
    "operatingHours" JSONB,
    "daysOpen" TEXT[],
    "petTypesAccepted" TEXT[],
    "sizesAccepted" TEXT[],
    "roomTypes" JSONB NOT NULL DEFAULT '[]',
    "amenities" TEXT[],
    "hasIsolationArea" BOOLEAN NOT NULL DEFAULT false,
    "emergencyVetName" TEXT,
    "emergencyVetPhone" TEXT,
    "extraServices" JSONB,
    "pickupDropoffAvail" BOOLEAN NOT NULL DEFAULT false,
    "pickupDropoffPrice" DECIMAL(8,2),
    "vaccinesRequired" TEXT[],
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT false,
    "requiresTrialDay" BOOLEAN NOT NULL DEFAULT false,
    "minStayNights" INTEGER,
    "maxStayNights" INTEGER,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pethotel_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "nickname" TEXT,
    "ageCategory" "AgeCategory",
    "neuteredStatus" "NeuteredStatus" NOT NULL DEFAULT 'unknown',
    "houseTrained" "HouseTrainedStatus" NOT NULL DEFAULT 'yes',
    "color" TEXT,
    "dateOfBirth" DATE,
    "weightKg" DECIMAL(5,2),
    "weightCategory" "WeightCategory",
    "gender" "PetGender" NOT NULL DEFAULT 'unknown',
    "isNeutered" BOOLEAN NOT NULL DEFAULT false,
    "hasMicrochip" BOOLEAN NOT NULL DEFAULT false,
    "microchipId" TEXT,
    "profilePhoto" TEXT,
    "photos" TEXT[],
    "vaccinationCertPhoto" TEXT,
    "vaccinationVerified" BOOLEAN NOT NULL DEFAULT false,
    "medicalConditions" TEXT,
    "specialNotes" TEXT,
    "feedingSchedule" JSONB NOT NULL DEFAULT '[]',
    "walkingSchedule" JSONB NOT NULL DEFAULT '[]',
    "temperament" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_medical_info" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "allergies" TEXT[],
    "medicalNotes" TEXT,
    "vetName" TEXT,
    "vetClinic" TEXT,
    "vetPhone" TEXT,
    "vetAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRel" TEXT,
    "altVetName" TEXT,
    "altVetPhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_medical_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_vaccinations" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "administeredDate" DATE NOT NULL,
    "expiryDate" DATE,
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_medications" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "medicationType" "MedicationType" NOT NULL DEFAULT 'pill',
    "dosage" TEXT,
    "unit" TEXT,
    "frequency" "MedicationFrequency" NOT NULL,
    "adminTimes" TEXT[],
    "startDate" DATE,
    "endDate" DATE,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_behavior" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "temperamentTags" TEXT[],
    "goodWithDogs" "BehaviorCompatibility" NOT NULL DEFAULT 'yes',
    "goodWithCats" "BehaviorCompatibility" NOT NULL DEFAULT 'yes',
    "goodWithKids" "BehaviorCompatibility" NOT NULL DEFAULT 'yes',
    "trainingLevel" "TrainingLevel" NOT NULL DEFAULT 'none',
    "energyLevel" "EnergyLevel" NOT NULL DEFAULT 'medium',
    "behaviorNotes" TEXT,
    "fearTriggers" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_behavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_schedules" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "scheduleType" "ScheduleType" NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "foodType" TEXT,
    "foodAmount" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_logs" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "actionType" "CareActionType" NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "petFriendId" TEXT,
    "trainerId" TEXT,
    "kennelId" TEXT,
    "petHotelId" TEXT,
    "bookingType" "BookingType" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "requestedStart" TIMESTAMP(3) NOT NULL,
    "requestedEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "serviceLocationType" "ServiceLocationType" NOT NULL,
    "serviceLat" DECIMAL(10,8),
    "serviceLng" DECIMAL(11,8),
    "serviceAddress" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "providerPayout" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeCharge" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" "PaymentMethod",
    "paymentReference" TEXT,
    "paymentAuthorizedAt" TIMESTAMP(3),
    "paymentCapturedAt" TIMESTAMP(3),
    "paymentRefundedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(10,2),
    "refundReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancellationType" "CancellationType",
    "readyForPickupAt" TIMESTAMP(3),
    "pickupConfirmedAt" TIMESTAMP(3),
    "specialInstructions" TEXT,
    "parentNotes" TEXT,
    "petSnapshot" JSONB,
    "parentReviewed" BOOLEAN NOT NULL DEFAULT false,
    "providerReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewDeadline" TIMESTAMP(3),
    "routingAttempt" INTEGER NOT NULL DEFAULT 1,
    "routingHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_end_codes" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_end_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_pets" (
    "bookingId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,

    CONSTRAINT "booking_pets_pkey" PRIMARY KEY ("bookingId","petId")
);

-- CreateTable
CREATE TABLE "booking_extensions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "newEndTime" TIMESTAMP(3) NOT NULL,
    "additionalPrice" DECIMAL(10,2),
    "reason" TEXT,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_disputes" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reasonCategory" "DisputeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrls" TEXT[],
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" "DisputeResolution",
    "resolutionNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "appealDeadline" TIMESTAMP(3),
    "parentAmount" DECIMAL(10,2),
    "providerAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_tasks" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "petId" TEXT,
    "taskType" "TaskType" NOT NULL,
    "taskName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "dueBy" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "photoUrl" TEXT,
    "notes" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "alertSentToParent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_sessions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "petIds" TEXT[],
    "petFriendId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "totalDistanceM" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "avgSpeedKmh" DECIMAL(5,2),
    "routeGeoJson" JSONB,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isFraudFlagged" BOOLEAN NOT NULL DEFAULT false,
    "fraudReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_tracking_points" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "accuracyM" DECIMAL(7,2),
    "speedMs" DECIMAL(5,2),
    "altitudeM" DECIMAL(8,2),
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "walk_tracking_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "direction" "TransactionDirection" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "gateway" "PaymentGateway",
    "gatewayRef" TEXT,
    "gatewayResponse" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petfriend_payouts" (
    "id" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "bookingId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "payoutMethod" "ProviderPayoutMethod" NOT NULL,
    "destination" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "gatewayRef" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petfriend_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "revieweeType" "RevieweeType" NOT NULL,
    "overallRating" DECIMAL(3,2) NOT NULL,
    "ratingCommunication" DECIMAL(3,2),
    "ratingReliability" DECIMAL(3,2),
    "ratingCareQuality" DECIMAL(3,2),
    "ratingValue" DECIMAL(3,2),
    "ratingPetBehavior" DECIMAL(3,2),
    "ratingCleanliness" DECIMAL(3,2),
    "comment" TEXT NOT NULL,
    "wouldRebook" BOOLEAN,
    "photos" TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "isModerated" BOOLEAN NOT NULL DEFAULT false,
    "moderationAction" "ModerationAction",
    "moderationNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "behaviorRating" INTEGER NOT NULL,
    "behaviorNotes" TEXT,
    "isVisibleToFuturePetFriends" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isPushSent" BOOLEAN NOT NULL DEFAULT false,
    "isSmsSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("followerId","followeeId")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "openingHours" JSONB,
    "petPolicy" TEXT,
    "petTypesAllowed" TEXT[],
    "photos" TEXT[],
    "submittedById" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_reviews" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "photos" TEXT[],
    "visitDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "referenceId" TEXT,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "petFriendId" TEXT NOT NULL,
    "service" "ServiceType" NOT NULL,
    "parentPrice" DECIMAL(8,2) NOT NULL,
    "providerCounter" DECIMAL(8,2),
    "finalPrice" DECIMAL(8,2),
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "round" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerType" "ProviderType" NOT NULL,
    "businessName" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "city" TEXT,
    "phone" TEXT,
    "coverPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationDocs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceMenu" JSONB,
    "operatingHours" JSONB,
    "maxCapacity" INTEGER,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "providerProfileId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(8,2) NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingredients" TEXT,
    "allergens" TEXT,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sellerType" "ProviderType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "sellerEarning" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "deliveryType" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_logs" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notifiedIncrements" INTEGER NOT NULL DEFAULT 0,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adoption_posts" (
    "id" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "petName" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "ageCategory" "AgeCategory",
    "gender" "PetGender" NOT NULL DEFAULT 'unknown',
    "isNeutered" BOOLEAN NOT NULL DEFAULT false,
    "isVaccinated" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "district" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Cairo',
    "requirements" TEXT,
    "contactMethod" "ContactMethod" NOT NULL DEFAULT 'in_app',
    "contactPhone" TEXT,
    "status" "AdoptionStatus" NOT NULL DEFAULT 'available',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adoption_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adoption_messages" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adoption_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causes" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CauseCategory" NOT NULL,
    "coverPhoto" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goalAmount" DECIMAL(10,2) NOT NULL,
    "raisedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "donorCount" INTEGER NOT NULL DEFAULT 0,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CauseStatus" NOT NULL DEFAULT 'pending_approval',
    "rejectionReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "withdrawalMethod" TEXT,
    "withdrawalAccount" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "causes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cause_updates" (
    "id" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cause_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "causeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_sellers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kitchenName" TEXT NOT NULL,
    "bio" TEXT,
    "district" TEXT,
    "profilePhoto" TEXT,
    "availability" JSONB NOT NULL,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_products" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAnimal" "FoodTargetAnimal" NOT NULL,
    "description" TEXT NOT NULL,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price" DECIMAL(8,2) NOT NULL,
    "unitDesc" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_orders" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "FoodOrderStatus" NOT NULL DEFAULT 'placed',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "sellerEarning" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "pickupSlot" TEXT NOT NULL,
    "rejectReason" TEXT,
    "buyerNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(8,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "food_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "productId" TEXT,
    "sellerId" TEXT,
    "targetUserId" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_idVerified_isActive_isBanned_idx" ON "users"("idVerified", "isActive", "isBanned");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "user_devices_userId_idx" ON "user_devices"("userId");

-- CreateIndex
CREATE INDEX "user_devices_fcmToken_idx" ON "user_devices"("fcmToken");

-- CreateIndex
CREATE INDEX "user_locations_userId_idx" ON "user_locations"("userId");

-- CreateIndex
CREATE INDEX "user_waitlist_serviceType_idx" ON "user_waitlist"("serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "user_waitlist_userId_serviceType_key" ON "user_waitlist"("userId", "serviceType");

-- CreateIndex
CREATE INDEX "payout_method_records_userId_idx" ON "payout_method_records"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "petfriend_profiles_userId_key" ON "petfriend_profiles"("userId");

-- CreateIndex
CREATE INDEX "petfriend_profiles_lat_lng_idx" ON "petfriend_profiles"("lat", "lng");

-- CreateIndex
CREATE INDEX "petfriend_profiles_isActive_isVerified_idx" ON "petfriend_profiles"("isActive", "isVerified");

-- CreateIndex
CREATE INDEX "petfriend_availability_templates_petFriendId_idx" ON "petfriend_availability_templates"("petFriendId");

-- CreateIndex
CREATE INDEX "petfriend_availability_overrides_petFriendId_overrideDate_idx" ON "petfriend_availability_overrides"("petFriendId", "overrideDate");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profiles_userId_key" ON "trainer_profiles"("userId");

-- CreateIndex
CREATE INDEX "trainer_profiles_isActive_isVerified_idx" ON "trainer_profiles"("isActive", "isVerified");

-- CreateIndex
CREATE INDEX "trainer_offerings_trainerId_type_isActive_idx" ON "trainer_offerings"("trainerId", "type", "isActive");

-- CreateIndex
CREATE INDEX "trainer_availability_templates_trainerId_idx" ON "trainer_availability_templates"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "kennel_profiles_userId_key" ON "kennel_profiles"("userId");

-- CreateIndex
CREATE INDEX "kennel_profiles_city_isActive_isVerified_idx" ON "kennel_profiles"("city", "isActive", "isVerified");

-- CreateIndex
CREATE INDEX "kennel_profiles_lat_lng_idx" ON "kennel_profiles"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "pethotel_profiles_userId_key" ON "pethotel_profiles"("userId");

-- CreateIndex
CREATE INDEX "pethotel_profiles_city_isActive_isVerified_idx" ON "pethotel_profiles"("city", "isActive", "isVerified");

-- CreateIndex
CREATE INDEX "pethotel_profiles_lat_lng_idx" ON "pethotel_profiles"("lat", "lng");

-- CreateIndex
CREATE INDEX "pets_ownerId_idx" ON "pets"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "pet_medical_info_petId_key" ON "pet_medical_info"("petId");

-- CreateIndex
CREATE INDEX "pet_vaccinations_petId_idx" ON "pet_vaccinations"("petId");

-- CreateIndex
CREATE INDEX "pet_vaccinations_expiryDate_idx" ON "pet_vaccinations"("expiryDate");

-- CreateIndex
CREATE INDEX "pet_medications_petId_isActive_idx" ON "pet_medications"("petId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pet_behavior_petId_key" ON "pet_behavior"("petId");

-- CreateIndex
CREATE INDEX "pet_schedules_petId_isActive_idx" ON "pet_schedules"("petId", "isActive");

-- CreateIndex
CREATE INDEX "care_logs_bookingId_idx" ON "care_logs"("bookingId");

-- CreateIndex
CREATE INDEX "care_logs_petId_idx" ON "care_logs"("petId");

-- CreateIndex
CREATE INDEX "bookings_parentId_status_createdAt_idx" ON "bookings"("parentId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "bookings_petFriendId_status_createdAt_idx" ON "bookings"("petFriendId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "bookings_status_requestedStart_idx" ON "bookings"("status", "requestedStart");

-- CreateIndex
CREATE INDEX "bookings_petFriendId_idx" ON "bookings"("petFriendId");

-- CreateIndex
CREATE INDEX "bookings_paymentStatus_idx" ON "bookings"("paymentStatus");

-- CreateIndex
CREATE INDEX "bookings_parentId_status_idx" ON "bookings"("parentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_end_codes_bookingId_key" ON "booking_end_codes"("bookingId");

-- CreateIndex
CREATE INDEX "booking_extensions_bookingId_idx" ON "booking_extensions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_disputes_bookingId_key" ON "booking_disputes"("bookingId");

-- CreateIndex
CREATE INDEX "booking_disputes_status_createdAt_idx" ON "booking_disputes"("status", "createdAt");

-- CreateIndex
CREATE INDEX "booking_tasks_bookingId_status_scheduledAt_idx" ON "booking_tasks"("bookingId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "booking_tasks_scheduledAt_status_idx" ON "booking_tasks"("scheduledAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "walk_sessions_taskId_key" ON "walk_sessions"("taskId");

-- CreateIndex
CREATE INDEX "walk_sessions_bookingId_idx" ON "walk_sessions"("bookingId");

-- CreateIndex
CREATE INDEX "walk_tracking_points_sessionId_recordedAt_idx" ON "walk_tracking_points"("sessionId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gatewayRef_key" ON "payment_transactions"("gatewayRef");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_createdAt_idx" ON "payment_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_transactions_bookingId_idx" ON "payment_transactions"("bookingId");

-- CreateIndex
CREATE INDEX "petfriend_payouts_petFriendId_status_idx" ON "petfriend_payouts"("petFriendId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_eventId_key" ON "processed_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "processed_webhook_events_eventId_idx" ON "processed_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "reviews_revieweeId_revieweeType_isPublished_idx" ON "reviews"("revieweeId", "revieweeType", "isPublished");

-- CreateIndex
CREATE INDEX "reviews_bookingId_idx" ON "reviews"("bookingId");

-- CreateIndex
CREATE INDEX "pet_reviews_petId_idx" ON "pet_reviews"("petId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "places_lat_lng_idx" ON "places"("lat", "lng");

-- CreateIndex
CREATE INDEX "places_category_isApproved_idx" ON "places"("category", "isApproved");

-- CreateIndex
CREATE INDEX "place_reviews_placeId_idx" ON "place_reviews"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "place_reviews_placeId_userId_key" ON "place_reviews"("placeId", "userId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_userId_createdAt_idx" ON "loyalty_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "offers_parentId_idx" ON "offers"("parentId");

-- CreateIndex
CREATE INDEX "offers_petFriendId_idx" ON "offers"("petFriendId");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE INDEX "admin_actions_adminId_createdAt_idx" ON "admin_actions"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_userId_key" ON "provider_profiles"("userId");

-- CreateIndex
CREATE INDEX "provider_profiles_providerType_isVerified_isActive_idx" ON "provider_profiles"("providerType", "isVerified", "isActive");

-- CreateIndex
CREATE INDEX "provider_profiles_city_providerType_idx" ON "provider_profiles"("city", "providerType");

-- CreateIndex
CREATE INDEX "products_sellerId_isAvailable_idx" ON "products"("sellerId", "isAvailable");

-- CreateIndex
CREATE INDEX "products_sellerType_isAvailable_idx" ON "products"("sellerType", "isAvailable");

-- CreateIndex
CREATE INDEX "orders_buyerId_idx" ON "orders"("buyerId");

-- CreateIndex
CREATE INDEX "orders_sellerId_idx" ON "orders"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "overtime_logs_bookingId_key" ON "overtime_logs"("bookingId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "adoption_posts_status_species_createdAt_idx" ON "adoption_posts"("status", "species", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "adoption_messages_postId_senderId_receiverId_idx" ON "adoption_messages"("postId", "senderId", "receiverId");

-- CreateIndex
CREATE INDEX "causes_status_endDate_idx" ON "causes"("status", "endDate");

-- CreateIndex
CREATE INDEX "donations_causeId_createdAt_idx" ON "donations"("causeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "cause_updates_causeId_createdAt_idx" ON "cause_updates"("causeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "withdrawal_requests_causeId_idx" ON "withdrawal_requests"("causeId");

-- CreateIndex
CREATE UNIQUE INDEX "food_sellers_userId_key" ON "food_sellers"("userId");

-- CreateIndex
CREATE INDEX "food_sellers_isActive_district_idx" ON "food_sellers"("isActive", "district");

-- CreateIndex
CREATE INDEX "food_products_sellerId_isAvailable_idx" ON "food_products"("sellerId", "isAvailable");

-- CreateIndex
CREATE INDEX "food_orders_buyerId_idx" ON "food_orders"("buyerId");

-- CreateIndex
CREATE INDEX "food_orders_buyerId_status_createdAt_idx" ON "food_orders"("buyerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "food_orders_sellerId_status_createdAt_idx" ON "food_orders"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "food_reviews_productId_idx" ON "food_reviews"("productId");

-- CreateIndex
CREATE INDEX "food_reviews_sellerId_idx" ON "food_reviews"("sellerId");

-- CreateIndex
CREATE INDEX "food_reviews_orderId_idx" ON "food_reviews"("orderId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_idReviewedById_fkey" FOREIGN KEY ("idReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_waitlist" ADD CONSTRAINT "user_waitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_method_records" ADD CONSTRAINT "payout_method_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_profiles" ADD CONSTRAINT "petfriend_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_availability_templates" ADD CONSTRAINT "petfriend_availability_templates_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "petfriend_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_availability_overrides" ADD CONSTRAINT "petfriend_availability_overrides_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "petfriend_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_certifications" ADD CONSTRAINT "petfriend_certifications_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "petfriend_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_offerings" ADD CONSTRAINT "trainer_offerings_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability_templates" ADD CONSTRAINT "trainer_availability_templates_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kennel_profiles" ADD CONSTRAINT "kennel_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pethotel_profiles" ADD CONSTRAINT "pethotel_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_medical_info" ADD CONSTRAINT "pet_medical_info_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_medications" ADD CONSTRAINT "pet_medications_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_behavior" ADD CONSTRAINT "pet_behavior_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_schedules" ADD CONSTRAINT "pet_schedules_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_end_codes" ADD CONSTRAINT "booking_end_codes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pets" ADD CONSTRAINT "booking_pets_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pets" ADD CONSTRAINT "booking_pets_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_extensions" ADD CONSTRAINT "booking_extensions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_disputes" ADD CONSTRAINT "booking_disputes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_tasks" ADD CONSTRAINT "booking_tasks_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_tasks" ADD CONSTRAINT "booking_tasks_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_sessions" ADD CONSTRAINT "walk_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "booking_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_sessions" ADD CONSTRAINT "walk_sessions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_tracking_points" ADD CONSTRAINT "walk_tracking_points_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "walk_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_payouts" ADD CONSTRAINT "petfriend_payouts_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petfriend_payouts" ADD CONSTRAINT "petfriend_payouts_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_reviews" ADD CONSTRAINT "pet_reviews_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_reviews" ADD CONSTRAINT "place_reviews_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_petFriendId_fkey" FOREIGN KEY ("petFriendId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "provider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_logs" ADD CONSTRAINT "overtime_logs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_posts" ADD CONSTRAINT "adoption_posts_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_messages" ADD CONSTRAINT "adoption_messages_postId_fkey" FOREIGN KEY ("postId") REFERENCES "adoption_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_messages" ADD CONSTRAINT "adoption_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_messages" ADD CONSTRAINT "adoption_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causes" ADD CONSTRAINT "causes_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "causes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cause_updates" ADD CONSTRAINT "cause_updates_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "causes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "causes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_sellers" ADD CONSTRAINT "food_sellers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_products" ADD CONSTRAINT "food_products_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "food_sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "food_sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "food_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "food_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "food_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "food_sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_reviews" ADD CONSTRAINT "food_reviews_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

