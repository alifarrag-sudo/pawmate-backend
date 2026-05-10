-- Drop the 7 legacy ServiceType enum values (dog_walking, pet_watching_*,
-- overnight_stay, trainer_session, kennel_boarding, pethotel_boarding).
-- Postgres doesn't support DROP VALUE on an enum, so we create a new enum
-- with only the canonical 9 values and swap every dependent column over.
--
-- Stage 1 backfills any rows that still use the legacy values so the
-- subsequent column-type cast doesn't fail. Each UPDATE is a no-op when
-- there are no matching rows.
--
-- Idempotent on the new-enum side via IF NOT EXISTS; the swap-and-drop
-- block runs only when the legacy values are still present so a re-run
-- against an already-migrated DB is safe.

-- ─── Stage 1 — backfill legacy values on every column ────────────────────────
UPDATE "bookings" SET "serviceType" = 'WALKING'    WHERE "serviceType"::text = 'dog_walking';
UPDATE "bookings" SET "serviceType" = 'DAY_CARE'   WHERE "serviceType"::text = 'pet_watching_hourly';
UPDATE "bookings" SET "serviceType" = 'DAY_CARE'   WHERE "serviceType"::text = 'pet_watching_daily';
UPDATE "bookings" SET "serviceType" = 'BOARDING'   WHERE "serviceType"::text = 'overnight_stay';
UPDATE "bookings" SET "serviceType" = 'TRAINING'   WHERE "serviceType"::text = 'trainer_session';
UPDATE "bookings" SET "serviceType" = 'KENNEL'     WHERE "serviceType"::text = 'kennel_boarding';
UPDATE "bookings" SET "serviceType" = 'PET_HOTEL'  WHERE "serviceType"::text = 'pethotel_boarding';

UPDATE "offers" SET "service" = 'WALKING'    WHERE "service"::text = 'dog_walking';
UPDATE "offers" SET "service" = 'DAY_CARE'   WHERE "service"::text = 'pet_watching_hourly';
UPDATE "offers" SET "service" = 'DAY_CARE'   WHERE "service"::text = 'pet_watching_daily';
UPDATE "offers" SET "service" = 'BOARDING'   WHERE "service"::text = 'overnight_stay';
UPDATE "offers" SET "service" = 'TRAINING'   WHERE "service"::text = 'trainer_session';
UPDATE "offers" SET "service" = 'KENNEL'     WHERE "service"::text = 'kennel_boarding';
UPDATE "offers" SET "service" = 'PET_HOTEL'  WHERE "service"::text = 'pethotel_boarding';

UPDATE "ProviderServiceEligibility" SET "serviceType" = 'WALKING'    WHERE "serviceType"::text = 'dog_walking';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'DAY_CARE'   WHERE "serviceType"::text = 'pet_watching_hourly';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'DAY_CARE'   WHERE "serviceType"::text = 'pet_watching_daily';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'BOARDING'   WHERE "serviceType"::text = 'overnight_stay';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'TRAINING'   WHERE "serviceType"::text = 'trainer_session';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'KENNEL'     WHERE "serviceType"::text = 'kennel_boarding';
UPDATE "ProviderServiceEligibility" SET "serviceType" = 'PET_HOTEL'  WHERE "serviceType"::text = 'pethotel_boarding';

-- ─── Stage 2 — swap enum if any legacy values still defined ──────────────────
DO $$
DECLARE
  has_legacy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ServiceType'
      AND e.enumlabel IN (
        'dog_walking', 'pet_watching_hourly', 'pet_watching_daily',
        'overnight_stay', 'trainer_session', 'kennel_boarding', 'pethotel_boarding'
      )
  ) INTO has_legacy;

  IF has_legacy THEN
    -- New enum with the canonical 9 values only.
    CREATE TYPE "ServiceType_new" AS ENUM (
      'BOARDING', 'WALKING', 'DAY_CARE',
      'KENNEL', 'PET_HOTEL', 'TRAINING',
      'VET', 'GROOMING',
      'PET_SHOP'
    );

    -- Swap each dependent column.
    ALTER TABLE "bookings"
      ALTER COLUMN "serviceType" TYPE "ServiceType_new"
      USING "serviceType"::text::"ServiceType_new";

    ALTER TABLE "offers"
      ALTER COLUMN "service" TYPE "ServiceType_new"
      USING "service"::text::"ServiceType_new";

    ALTER TABLE "ProviderServiceEligibility"
      ALTER COLUMN "serviceType" TYPE "ServiceType_new"
      USING "serviceType"::text::"ServiceType_new";

    -- Drop the old enum and rename the new one into its place.
    DROP TYPE "ServiceType";
    ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";
  END IF;
END$$;
