-- ============================================================
-- PawMate Security Fixes Migration
-- Apply this ONCE to an existing database that was set up via `prisma db push`
-- Run: psql $DATABASE_URL -f migration.sql
--      OR paste into Supabase SQL Editor
-- ============================================================

-- FIX 5: Unique constraint on payment_transactions.gateway_ref
-- Prevents double-processing of the same gateway transaction
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_gatewayRef_key" UNIQUE ("gatewayRef");

-- FIX 5: Webhook event deduplication table
-- Prevents replayed Paymob webhook callbacks from being processed twice
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"     TEXT        NOT NULL,
  "provider"    TEXT        NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "processed_webhook_events_eventId_key"
  ON "processed_webhook_events"("eventId");
CREATE INDEX IF NOT EXISTS "processed_webhook_events_eventId_idx"
  ON "processed_webhook_events"("eventId");

-- FIX 10: Missing index on bookings.paymentStatus
CREATE INDEX IF NOT EXISTS "bookings_paymentStatus_idx"
  ON "bookings"("paymentStatus");

-- FIX 10: Standalone index on bookings.sitterId (composite exists but single needed too)
CREATE INDEX IF NOT EXISTS "bookings_sitterId_idx"
  ON "bookings"("sitterId");

-- FIX 10: Composite index for owner booking list with status filter
CREATE INDEX IF NOT EXISTS "bookings_ownerId_status_idx"
  ON "bookings"("ownerId", "status");

-- FIX 10: Standalone indexes on offers for single-field lookups
CREATE INDEX IF NOT EXISTS "offers_ownerId_idx"
  ON "offers"("ownerId");
CREATE INDEX IF NOT EXISTS "offers_sitterId_idx"
  ON "offers"("sitterId");
CREATE INDEX IF NOT EXISTS "offers_status_idx"
  ON "offers"("status");

-- FIX 10: Standalone buyerId index on food_orders
CREATE INDEX IF NOT EXISTS "food_orders_buyerId_idx"
  ON "food_orders"("buyerId");

-- FIX 11: Soft delete column on bookings (never hard-delete financial records)
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- FIX 11: Soft delete column on food_orders
ALTER TABLE "food_orders"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
