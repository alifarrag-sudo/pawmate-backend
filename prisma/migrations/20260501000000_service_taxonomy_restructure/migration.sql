-- ============================================================
-- Service taxonomy restructure
-- ============================================================
-- 1. Add ServiceCategory enum
-- 2. Add new ServiceType enum values (BOARDING, WALKING, DAY_CARE,
--    KENNEL, PET_HOTEL, TRAINING, VET, GROOMING, PET_SHOP). Legacy
--    values are kept so existing rows continue to validate.
-- 3. Add DayCareSessionType enum
-- 4. Add per-service pricing columns to petfriend_profiles
-- 5. Add late-fee + session columns to bookings
-- 6. Add serviceCategory column to bookings
-- 7. Backfill bookings.serviceCategory from current serviceType where possible
-- 8. Mark pricing_bounds as deprecated (kept until follow-up migration)
-- ============================================================

-- 1. ServiceCategory enum
CREATE TYPE "ServiceCategory" AS ENUM (
  'SERVICES',
  'PROFESSIONAL_SERVICES',
  'PET_CARE_SERVICES',
  'MARKETPLACE'
);

-- 2. New ServiceType values (Postgres enums require ALTER TYPE ... ADD VALUE)
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'BOARDING';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'WALKING';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'DAY_CARE';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'KENNEL';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'PET_HOTEL';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'TRAINING';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'VET';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'GROOMING';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'PET_SHOP';

-- 3. DayCareSessionType enum
CREATE TYPE "DayCareSessionType" AS ENUM ('SIX_HOUR', 'EIGHT_HOUR');

-- 4. Per-service pricing on petfriend_profiles
ALTER TABLE "petfriend_profiles"
  ADD COLUMN IF NOT EXISTS "boardingPerNightRateEgp"     INTEGER,
  ADD COLUMN IF NOT EXISTS "boardingLatePickupHourlyEgp" INTEGER,
  ADD COLUMN IF NOT EXISTS "walkingPerHourRateEgp"       INTEGER,
  ADD COLUMN IF NOT EXISTS "walkingMinimumHours"         INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "walkingExtraHourlyRateEgp"   INTEGER,
  ADD COLUMN IF NOT EXISTS "daycareSixHourRateEgp"       INTEGER,
  ADD COLUMN IF NOT EXISTS "daycareEightHourRateEgp"     INTEGER,
  ADD COLUMN IF NOT EXISTS "daycareLatePickupHourlyEgp"  INTEGER;

-- 5 + 6. Booking late-fee, session, and category columns
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "serviceCategory"  "ServiceCategory",
  ADD COLUMN IF NOT EXISTS "checkoutDate"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sessionType"      "DayCareSessionType",
  ADD COLUMN IF NOT EXISTS "sessionEndTime"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualPickupTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lateFeeEgp"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lateFeeHours"     INTEGER NOT NULL DEFAULT 0;

-- 7. Backfill serviceCategory from existing serviceType values
UPDATE "bookings" SET "serviceCategory" = 'SERVICES'
  WHERE "serviceType" IN ('overnight_stay', 'dog_walking', 'pet_watching_hourly', 'pet_watching_daily', 'BOARDING', 'WALKING', 'DAY_CARE');
UPDATE "bookings" SET "serviceCategory" = 'PROFESSIONAL_SERVICES'
  WHERE "serviceType" IN ('kennel_boarding', 'pethotel_boarding', 'trainer_session', 'KENNEL', 'PET_HOTEL', 'TRAINING');

-- 8. PricingBounds: keep table but truncate enforcement.
-- (Provider rates are no longer capped. Kept for one release for safety; will drop in
-- a follow-up migration: remove_pricing_bounds.)
COMMENT ON TABLE "pricing_bounds" IS 'DEPRECATED: pricing caps removed. Will be dropped in next migration.';
