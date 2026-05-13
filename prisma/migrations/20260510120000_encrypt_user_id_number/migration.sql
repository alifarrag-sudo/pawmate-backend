-- Encrypt User.idNumber: rename plaintext column to idNumberEnc and add idNumberIv
-- for the AES-256-GCM IV. The previous column was declared `String?` with a
-- "Encrypted" comment but the database stored plaintext, so the rename does NOT
-- imply existing rows are encrypted. A one-time backfill (encrypt-in-place via
-- MedicalEncryptionService, populate idNumberIv) is required before any new
-- client attempts to decrypt. Until backfill: treat (idNumberEnc IS NOT NULL,
-- idNumberIv IS NULL) as legacy plaintext.

ALTER TABLE "users" RENAME COLUMN "idNumber" TO "idNumberEnc";
ALTER TABLE "users" ADD COLUMN "idNumberIv" TEXT;
