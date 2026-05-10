-- G1: Add vaccination-passport (private storage key + verification) and
-- pet-licence (encrypted number + governorate) fields to Pet. Legacy
-- vaccinationCertPhoto / vaccinationVerified columns stay in place for
-- back-compat with existing rows; new code writes the new columns.

ALTER TABLE "Pet"
  ADD COLUMN IF NOT EXISTS "vaccinationPassportKey" TEXT,
  ADD COLUMN IF NOT EXISTS "vaccinationVerifiedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "vaccinationVerifiedBy"  TEXT,
  ADD COLUMN IF NOT EXISTS "vaccinationExpiresAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "licenceNumberEnc"       TEXT,
  ADD COLUMN IF NOT EXISTS "licenceGovernorate"     TEXT,
  ADD COLUMN IF NOT EXISTS "licenceVerified"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "licenceSubmittedAt"     TIMESTAMP(3);
