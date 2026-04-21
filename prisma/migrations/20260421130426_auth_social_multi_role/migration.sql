-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'owner';
ALTER TYPE "UserRole" ADD VALUE 'owner_restricted';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_authProvider_authProviderId_idx" ON "users"("authProvider", "authProviderId");

-- CreateIndex
CREATE INDEX "users_emailVerified_idx" ON "users"("emailVerified");
