-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('KENNEL', 'PET_HOTEL', 'VET_CLINIC', 'SHOP', 'GROOMING_SALON', 'TRAINING_ACADEMY', 'MULTI_SERVICE');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('PENDING_DOCS', 'APPROVED', 'ADMIN_REVIEW', 'SUSPENDED', 'REJECTED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'MANAGER', 'PROVIDER');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- AlterEnum
ALTER TYPE "ActiveRole" ADD VALUE 'operator';

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" "BusinessType" NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "coverPhotoUrl" TEXT,
    "photosUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commercialRegNumber" TEXT,
    "taxCard" TEXT,
    "commercialRegDocUrl" TEXT,
    "businessEmail" TEXT NOT NULL,
    "businessPhone" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "websiteUrl" TEXT,
    "primaryAddress" TEXT NOT NULL,
    "primaryCity" TEXT NOT NULL,
    "primaryLat" DOUBLE PRECISION,
    "primaryLng" DOUBLE PRECISION,
    "servicesJson" JSONB,
    "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING_DOCS',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoApprovedAt" TIMESTAMP(3),
    "adminReviewedAt" TIMESTAMP(3),
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_branches" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'PROVIDER',
    "providerType" "ProviderType" NOT NULL,
    "providerProfileId" TEXT,
    "canAcceptBookings" BOOLEAN NOT NULL DEFAULT true,
    "canSetOwnAvailability" BOOLEAN NOT NULL DEFAULT true,
    "canMessageParents" BOOLEAN NOT NULL DEFAULT true,
    "canWithdrawEarnings" BOOLEAN NOT NULL DEFAULT true,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "assignedBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "inviteLinkUrl" TEXT,
    "invitedEmail" TEXT,
    "invitedPhone" TEXT,
    "invitedName" TEXT,
    "targetRole" "TeamRole" NOT NULL DEFAULT 'PROVIDER',
    "targetProviderType" "ProviderType" NOT NULL DEFAULT 'PETFRIEND',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_ownerId_key" ON "business_profiles"("ownerId");

-- CreateIndex
CREATE INDEX "business_profiles_primaryCity_idx" ON "business_profiles"("primaryCity");

-- CreateIndex
CREATE INDEX "business_profiles_status_idx" ON "business_profiles"("status");

-- CreateIndex
CREATE INDEX "business_profiles_businessType_idx" ON "business_profiles"("businessType");

-- CreateIndex
CREATE INDEX "business_branches_businessId_idx" ON "business_branches"("businessId");

-- CreateIndex
CREATE INDEX "team_members_businessId_idx" ON "team_members"("businessId");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_businessId_userId_key" ON "team_members"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_inviteCode_key" ON "team_invites"("inviteCode");

-- CreateIndex
CREATE INDEX "team_invites_inviteCode_idx" ON "team_invites"("inviteCode");

-- CreateIndex
CREATE INDEX "team_invites_businessId_status_idx" ON "team_invites"("businessId", "status");

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_branches" ADD CONSTRAINT "business_branches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
