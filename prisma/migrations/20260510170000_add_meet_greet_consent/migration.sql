-- G2 Meet & Greet — observe-only mode. Adds the MeetGreetStatus enum and
-- a meet_greet_consents table, with FK back to bookings. Idempotent via
-- IF NOT EXISTS so re-running against an already-applied target is safe.

-- ─── Enum ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MeetGreetStatus') THEN
    CREATE TYPE "MeetGreetStatus" AS ENUM (
      'PENDING',
      'SCHEDULED',
      'COMPLETED',
      'CANCELLED',
      'WAIVED'
    );
  END IF;
END$$;

-- ─── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "meet_greet_consents" (
  "id"                 TEXT NOT NULL,
  "bookingId"          TEXT NOT NULL,
  "parentId"           TEXT NOT NULL,
  "providerId"         TEXT NOT NULL,
  "status"             "MeetGreetStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt"        TIMESTAMP(3),
  "completedAt"        TIMESTAMP(3),
  "cancelledAt"        TIMESTAMP(3),
  "waivedAt"           TIMESTAMP(3),
  "waivedReason"       TEXT,
  "parentConsentGiven" BOOLEAN NOT NULL DEFAULT false,
  "parentConsentAt"    TIMESTAMP(3),
  "consentTextVersion" TEXT,
  "consentTextEn"      TEXT,
  "consentTextAr"      TEXT,
  "providerNotes"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "meet_greet_consents_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "meet_greet_consents_bookingId_key"
  ON "meet_greet_consents"("bookingId");

CREATE INDEX IF NOT EXISTS "meet_greet_consents_bookingId_idx"
  ON "meet_greet_consents"("bookingId");

CREATE INDEX IF NOT EXISTS "meet_greet_consents_parentId_idx"
  ON "meet_greet_consents"("parentId");

CREATE INDEX IF NOT EXISTS "meet_greet_consents_providerId_idx"
  ON "meet_greet_consents"("providerId");

CREATE INDEX IF NOT EXISTS "meet_greet_consents_status_idx"
  ON "meet_greet_consents"("status");

-- ─── Foreign Keys ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meet_greet_consents_bookingId_fkey'
      AND table_name = 'meet_greet_consents'
  ) THEN
    ALTER TABLE "meet_greet_consents"
      ADD CONSTRAINT "meet_greet_consents_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
