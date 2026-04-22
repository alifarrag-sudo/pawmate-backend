/*
  Warnings:

  - Added the required column `updatedAt` to the `petfriend_payouts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PetFriendStatus" AS ENUM ('PENDING_DOCS', 'APPROVED', 'ADMIN_REVIEW', 'SUSPENDED', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('SCHEDULED', 'INSTANT');

-- AlterTable
ALTER TABLE "petfriend_payouts" ADD COLUMN     "bookingIds" TEXT[],
ADD COLUMN     "bookingsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commissionEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "instantCashoutFeeEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "petFriendProfileId" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "type" "PayoutType" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- AlterTable
ALTER TABLE "petfriend_profiles" ADD COLUMN     "acceptsCats" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsDogs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsOther" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminReviewedAt" TIMESTAMP(3),
ADD COLUMN     "adminReviewedBy" TEXT,
ADD COLUMN     "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "autoApprovedAt" TIMESTAMP(3),
ADD COLUMN     "availabilityJson" JSONB,
ADD COLUMN     "availableBalanceEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
ADD COLUMN     "fiveStarCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastPayoutAt" TIMESTAMP(3),
ADD COLUMN     "maxDogSizeKg" INTEGER,
ADD COLUMN     "maxPetsPerBooking" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "payoutMethodJson" JSONB,
ADD COLUMN     "pccUrl" TEXT,
ADD COLUMN     "pendingBalanceEgp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratePerDay" INTEGER,
ADD COLUMN     "ratePerHour" INTEGER,
ADD COLUMN     "ratePerNight" INTEGER,
ADD COLUMN     "ratePerWalk" INTEGER,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "selfieWithIdUrl" TEXT,
ADD COLUMN     "servicesOffered" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" "PetFriendStatus" NOT NULL DEFAULT 'PENDING_DOCS',
ADD COLUMN     "suspendedUntil" TIMESTAMP(3),
ADD COLUMN     "totalEarnedEgp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pricing_bounds" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "minEgp" INTEGER NOT NULL,
    "defaultMaxEgp" INTEGER NOT NULL,
    "eliteMaxEgp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_bounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_bounds_serviceType_key" ON "pricing_bounds"("serviceType");

-- CreateIndex
CREATE INDEX "petfriend_payouts_petFriendProfileId_status_idx" ON "petfriend_payouts"("petFriendProfileId", "status");

-- CreateIndex
CREATE INDEX "petfriend_payouts_scheduledFor_idx" ON "petfriend_payouts"("scheduledFor");

-- CreateIndex
CREATE INDEX "petfriend_profiles_status_idx" ON "petfriend_profiles"("status");

-- AddForeignKey
ALTER TABLE "petfriend_payouts" ADD CONSTRAINT "petfriend_payouts_petFriendProfileId_fkey" FOREIGN KEY ("petFriendProfileId") REFERENCES "petfriend_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
