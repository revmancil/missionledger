-- Paired bank transfers: one leg posts GL; mirror leg is register-only (exclude_from_gl).

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "exclude_from_gl" boolean NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "transfer_pair_transaction_id" text;
