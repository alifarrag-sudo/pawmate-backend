-- AlignPrismaSchema: users.email was already NOT NULL in DB.
-- This migration is a no-op at DB level; it exists to keep
-- Prisma migration history in sync with the schema change
-- from String? to String.

-- Idempotent: SET NOT NULL on an already NOT NULL column is safe.
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
