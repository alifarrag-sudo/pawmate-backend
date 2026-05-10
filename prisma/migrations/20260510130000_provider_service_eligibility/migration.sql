-- ProviderServiceEligibility — tracks which services a provider has applied
-- to offer and the training course they must complete before each is
-- activated. One row per (userId, serviceType). Status flips from PENDING
-- through COURSE_IN_PROGRESS / COURSE_COMPLETED to ACTIVE; SUSPENDED on
-- admin action.

CREATE TYPE "ProviderServiceStatus" AS ENUM (
  'PENDING',
  'COURSE_IN_PROGRESS',
  'COURSE_COMPLETED',
  'ACTIVE',
  'SUSPENDED'
);

CREATE TABLE "provider_service_eligibility" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "serviceType"       "ServiceType" NOT NULL,
  "requiredCourseId"  TEXT,
  "trainingRequired"  BOOLEAN NOT NULL DEFAULT true,
  "status"            "ProviderServiceStatus" NOT NULL DEFAULT 'PENDING',
  "courseStartedAt"   TIMESTAMP(3),
  "courseCompletedAt" TIMESTAMP(3),
  "activatedAt"       TIMESTAMP(3),
  "suspendedAt"       TIMESTAMP(3),
  "suspensionReason"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_service_eligibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_service_eligibility_userId_serviceType_key"
  ON "provider_service_eligibility"("userId", "serviceType");

CREATE INDEX "provider_service_eligibility_userId_idx"
  ON "provider_service_eligibility"("userId");

CREATE INDEX "provider_service_eligibility_status_idx"
  ON "provider_service_eligibility"("status");

ALTER TABLE "provider_service_eligibility"
  ADD CONSTRAINT "provider_service_eligibility_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
