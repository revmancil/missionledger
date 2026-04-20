-- Plaid: one Item can include multiple accounts (e.g. checking + money market).
-- Store which Plaid account_id maps to each MissionLedger bank row; store per-tx source for cleanup.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "plaid_account_id" text;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "plaid_source_account_id" text;
