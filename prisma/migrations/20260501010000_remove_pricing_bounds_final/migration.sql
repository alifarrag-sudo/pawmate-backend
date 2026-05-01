-- ============================================================
-- Final removal of the legacy PricingBounds tier-cap system.
-- All code references were stripped in the same release; the only thing
-- left is the table itself.
-- Plus: add `late_fee` to TransactionType for late-pickup charges.
-- ============================================================

DROP TABLE IF EXISTS "pricing_bounds";

-- TransactionType: add late_fee value (Postgres enums require ALTER TYPE).
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'late_fee';
