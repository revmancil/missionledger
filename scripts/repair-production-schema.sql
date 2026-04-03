-- MissionLedger: idempotent repairs for older Postgres databases (e.g. Render).
-- Run in your production SQL shell if the API still logs "column does not exist" after deploy.
-- Safe to re-run; each statement is IF NOT EXISTS or additive.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'gl_source_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.gl_source_type AS ENUM ('TRANSACTION', 'JOURNAL_ENTRY', 'OPENING_BALANCE', 'MANUAL_JE');
  END IF;
END $$;
ALTER TYPE gl_source_type ADD VALUE IF NOT EXISTS 'MANUAL_JE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'gl_functional_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.gl_functional_type AS ENUM ('PROGRAM_SERVICE', 'MANAGEMENT_GENERAL', 'FUNDRAISING');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'accounting_method' AND n.nspname = 'public') THEN
    CREATE TYPE public.accounting_method AS ENUM ('CASH', 'ACCRUAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'fund_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.fund_type AS ENUM ('UNRESTRICTED', 'RESTRICTED_TEMP', 'RESTRICTED_PERM', 'BOARD_DESIGNATED');
  END IF;
END $$;

ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'OFFICER';

-- ── transactions ────────────────────────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS donor_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_split BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS check_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS functional_type TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_fingerprint TEXT;

-- ── gl_entries (required for /api/transactions GL + 990-readiness) ───────────
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS journal_entry_id TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS source_type public.gl_source_type NOT NULL DEFAULT 'TRANSACTION'::public.gl_source_type;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS fund_id TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS fund_name TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS functional_type public.gl_functional_type;
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE gl_entries g
SET account_code = c.code, account_name = c.name
FROM chart_of_accounts c
WHERE c.id = g.account_id AND c.company_id = g.company_id
  AND (g.account_code IS NULL OR TRIM(g.account_code) = '' OR g.account_name IS NULL OR TRIM(g.account_name) = '');

-- ── users / companies ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_comped BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS comped_note TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accounting_method public.accounting_method NOT NULL DEFAULT 'CASH'::public.accounting_method;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_year_end_month TEXT NOT NULL DEFAULT '12';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS closed_until TIMESTAMP;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS opening_balance_entry_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS opening_balance_date TIMESTAMP;

-- ── funds / bank ────────────────────────────────────────────────────────────
ALTER TABLE funds ADD COLUMN IF NOT EXISTS fund_type public.fund_type NOT NULL DEFAULT 'UNRESTRICTED';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_access_token TEXT;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_item_id TEXT;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_institution_name TEXT;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_plaid_linked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_last_synced_at TIMESTAMP;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
