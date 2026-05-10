-- G1: Provider Service Eligibility — full schema replacement.
-- Drops the prior PENDING/IN_PROGRESS/ACTIVE pipeline (added in
-- 20260510130000_provider_service_eligibility) and replaces it with the
-- richer lifecycle model: per-document approval flags, training
-- completion + score + certificate, full review timestamps, and a
-- separate audit log. Uses IF EXISTS so this runs cleanly whether or
-- not the prior migration ever applied to the target environment.

-- ─── Drop prior shape ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "provider_service_eligibility";
DROP TYPE IF EXISTS "ProviderServiceStatus";

-- ─── New enums ───────────────────────────────────────────────────────────────
CREATE TYPE "ProviderCategory" AS ENUM (
  'SERVICES',
  'PROFESSIONAL_SERVICES',
  'PETCARE',
  'MARKETPLACE'
);

CREATE TYPE "VerificationRiskTier" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE "ProviderEligibilityStatus" AS ENUM (
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED'
);

CREATE TYPE "ProviderEligibilityAuditAction" AS ENUM (
  'CREATED',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
  'REVERIFICATION_REQUESTED',
  'TRAINING_COMPLETED',
  'DOCUMENT_APPROVED',
  'DOCUMENT_REJECTED'
);

-- ─── ProviderServiceEligibility ──────────────────────────────────────────────
CREATE TABLE "ProviderServiceEligibility" (
  "id"                    TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "category"              "ProviderCategory" NOT NULL,
  "serviceType"           "ServiceType" NOT NULL,
  "riskTier"              "VerificationRiskTier" NOT NULL,
  "status"                "ProviderEligibilityStatus" NOT NULL DEFAULT 'PENDING',
  "statusReason"          TEXT,

  "profilePhotoApproved"  BOOLEAN NOT NULL DEFAULT false,
  "idFrontApproved"       BOOLEAN NOT NULL DEFAULT false,
  "idBackApproved"        BOOLEAN NOT NULL DEFAULT false,
  "selfieWithIdApproved"  BOOLEAN NOT NULL DEFAULT false,
  "pccApproved"           BOOLEAN NOT NULL DEFAULT false,

  "trainingRequired"      BOOLEAN NOT NULL DEFAULT false,
  "requiredCourseId"      TEXT,
  "trainingPassed"        BOOLEAN NOT NULL DEFAULT false,
  "trainingScore"         INTEGER,
  "trainingCompletedAt"   TIMESTAMP(3),
  "certificateKey"        TEXT,

  "submittedAt"           TIMESTAMP(3),
  "reviewedAt"            TIMESTAMP(3),
  "reviewedByUserId"      TEXT,
  "approvedAt"            TIMESTAMP(3),
  "expiresAt"             TIMESTAMP(3),
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderServiceEligibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderServiceEligibility_providerId_serviceType_key"
  ON "ProviderServiceEligibility"("providerId", "serviceType");

CREATE INDEX "ProviderServiceEligibility_providerId_idx"
  ON "ProviderServiceEligibility"("providerId");

CREATE INDEX "ProviderServiceEligibility_status_idx"
  ON "ProviderServiceEligibility"("status");

CREATE INDEX "ProviderServiceEligibility_riskTier_idx"
  ON "ProviderServiceEligibility"("riskTier");

CREATE INDEX "ProviderServiceEligibility_expiresAt_idx"
  ON "ProviderServiceEligibility"("expiresAt");

ALTER TABLE "ProviderServiceEligibility"
  ADD CONSTRAINT "ProviderServiceEligibility_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ProviderServiceEligibilityAuditLog ──────────────────────────────────────
CREATE TABLE "ProviderServiceEligibilityAuditLog" (
  "id"            TEXT NOT NULL,
  "eligibilityId" TEXT NOT NULL,
  "actorUserId"   TEXT,
  "action"        "ProviderEligibilityAuditAction" NOT NULL,
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderServiceEligibilityAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderServiceEligibilityAuditLog_eligibilityId_idx"
  ON "ProviderServiceEligibilityAuditLog"("eligibilityId");

CREATE INDEX "ProviderServiceEligibilityAuditLog_createdAt_idx"
  ON "ProviderServiceEligibilityAuditLog"("createdAt");

ALTER TABLE "ProviderServiceEligibilityAuditLog"
  ADD CONSTRAINT "ProviderServiceEligibilityAuditLog_eligibilityId_fkey"
  FOREIGN KEY ("eligibilityId") REFERENCES "ProviderServiceEligibility"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
