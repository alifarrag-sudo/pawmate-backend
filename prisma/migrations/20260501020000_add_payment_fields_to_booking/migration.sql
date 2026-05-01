-- Booking: Paymob intent / order tracking + paidAt timestamp.
-- Set when client requests a payment intent; paidAt populated by the webhook
-- on a successful charge. Nullable so existing rows remain valid.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "paymobIntentId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymobOrderId"  TEXT,
  ADD COLUMN IF NOT EXISTS "paidAt"         TIMESTAMP(3);
