/*
  Warnings:

  - You are about to drop the column `addressCity` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `addressDistrict` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `avgRating` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `bookingLeadHours` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `certifications` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `facilityPhotos` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `methodsDescription` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `specializations` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `totalReviews` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `videoIntroUrl` on the `trainer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `yearsExperience` on the `trainer_profiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TrainerStatus" AS ENUM ('PENDING_DOCS', 'APPROVED', 'ADMIN_REVIEW', 'SUSPENDED', 'REJECTED', 'DEACTIVATED');

-- AlterEnum
ALTER TYPE "ActiveRole" ADD VALUE 'trainer';

-- DropIndex
DROP INDEX "trainer_profiles_isActive_isVerified_idx";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "sessionPackageId" TEXT,
ADD COLUMN     "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionsTotal" INTEGER,
ADD COLUMN     "trainerNotes" JSONB,
ADD COLUMN     "trainerProfileId" TEXT;

-- AlterTable
ALTER TABLE "petfriend_payouts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "trainer_profiles" DROP COLUMN "addressCity",
DROP COLUMN "addressDistrict",
DROP COLUMN "avgRating",
DROP COLUMN "bookingLeadHours",
DROP COLUMN "certifications",
DROP COLUMN "facilityPhotos",
DROP COLUMN "isActive",
DROP COLUMN "isVerified",
DROP COLUMN "lat",
DROP COLUMN "lng",
DROP COLUMN "methodsDescription",
DROP COLUMN "specializations",
DROP COLUMN "totalReviews",
DROP COLUMN "videoIntroUrl",
DROP COLUMN "yearsExperience",
ADD COLUMN     "adminReviewedAt" TIMESTAMP(3),
ADD COLUMN     "adminReviewedBy" TEXT,
ADD COLUMN     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "autoApprovedAt" TIMESTAMP(3),
ADD COLUMN     "availabilityJson" JSONB,
ADD COLUMN     "availableBalanceEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "averageRating" DOUBLE PRECISION,
ADD COLUMN     "baseLat" DOUBLE PRECISION,
ADD COLUMN     "baseLng" DOUBLE PRECISION,
ADD COLUMN     "certificationsJson" JSONB,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
ADD COLUMN     "completionRate" DOUBLE PRECISION,
ADD COLUMN     "experienceYears" INTEGER,
ADD COLUMN     "facilityAddress" TEXT,
ADD COLUMN     "facilityPhotosUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fiveStarCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idBackUrl" TEXT,
ADD COLUMN     "idFrontUrl" TEXT,
ADD COLUMN     "inHomeVisits" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY['Arabic']::TEXT[],
ADD COLUMN     "lastPayoutAt" TIMESTAMP(3),
ADD COLUMN     "maxSessionsPerDay" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "ownFacility" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutMethodJson" JSONB,
ADD COLUMN     "pendingBalanceEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profilePhotoUrl" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "servicesJson" JSONB,
ADD COLUMN     "showcaseVideoUrl" TEXT,
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" "TrainerStatus" NOT NULL DEFAULT 'PENDING_DOCS',
ADD COLUMN     "suspendedUntil" TIMESTAMP(3),
ADD COLUMN     "totalEarnedEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPrograms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSessions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "virtualSessions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "trainer_payouts" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "payoutMethod" "ProviderPayoutMethod" NOT NULL,
    "destination" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "type" "PayoutType" NOT NULL DEFAULT 'SCHEDULED',
    "commissionEgp" INTEGER NOT NULL DEFAULT 0,
    "netEgp" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "bookingsCount" INTEGER NOT NULL DEFAULT 0,
    "bookingIds" TEXT[],
    "instantCashoutFeeEgp" INTEGER NOT NULL DEFAULT 0,
    "gatewayRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainer_payouts_trainerId_status_idx" ON "trainer_payouts"("trainerId", "status");

-- CreateIndex
CREATE INDEX "trainer_payouts_scheduledFor_idx" ON "trainer_payouts"("scheduledFor");

-- CreateIndex
CREATE INDEX "bookings_trainerProfileId_idx" ON "bookings"("trainerProfileId");

-- CreateIndex
CREATE INDEX "trainer_profiles_status_idx" ON "trainer_profiles"("status");

-- CreateIndex
CREATE INDEX "trainer_profiles_city_idx" ON "trainer_profiles"("city");

-- CreateIndex
CREATE INDEX "trainer_profiles_averageRating_idx" ON "trainer_profiles"("averageRating");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_payouts" ADD CONSTRAINT "trainer_payouts_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
