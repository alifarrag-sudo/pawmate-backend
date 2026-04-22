-- Referral system + notification routing (Prompt 8)

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'SIGNED_UP', 'QUALIFIED', 'REWARDED', 'EXPIRED');

-- AlterTable: Add referral fields to users
ALTER TABLE "users" ADD COLUMN "referralCode" TEXT,
ADD COLUMN "accountCreditEgp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add target_role and deep_link to notifications
ALTER TABLE "notifications" ADD COLUMN "targetRole" TEXT NOT NULL DEFAULT 'ANY',
ADD COLUMN "deepLink" TEXT;

-- CreateTable: referrals
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "refereeUserId" TEXT,
    "refereeRole" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardEgp" INTEGER NOT NULL DEFAULT 0,
    "rewardType" TEXT,
    "qualifyingEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");
CREATE INDEX "users_referralCode_idx" ON "users"("referralCode");

CREATE INDEX "referrals_referrerUserId_idx" ON "referrals"("referrerUserId");
CREATE INDEX "referrals_referralCode_idx" ON "referrals"("referralCode");
CREATE INDEX "referrals_refereeUserId_idx" ON "referrals"("refereeUserId");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
