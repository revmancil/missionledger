import app from "./app";
import { seedPlatformAdmin } from "./seeds/platform-admin";
import { runMigrations, getStripeSync, getUncachableStripeClient, isUsingOwnStripeKey } from "./lib/stripeClient";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const REQUIRED_SCHEMA: Record<string, string[]> = {
  companies: ["id", "company_code", "name", "subscription_status", "is_active"],
  users: ["id", "company_id", "user_id", "email", "password", "role", "is_active", "is_platform_admin"],
  organization_users: ["id", "user_id", "company_id", "role", "is_primary", "is_active"],
  funds: ["id", "company_id", "name", "fund_type", "is_active"],
  bank_accounts: ["id", "company_id", "name", "current_balance", "plaid_access_token", "is_plaid_linked"],
  transactions: ["id", "company_id", "date", "payee", "amount", "transaction_type", "transaction_status", "is_void", "vendor_id"],
  chart_of_accounts: ["id", "company_id", "code", "name", "coa_type", "is_active"],
  gl_entries: [
    "id",
    "company_id",
    "account_id",
    "amount",
    "entry_type",
    "date",
    "is_void",
    "transaction_id",
    "journal_entry_id",
    "source_type",
    "account_code",
    "account_name",
    "functional_type",
  ],
  custom_report_templates: ["id", "company_id", "name", "config"],
};

async function validateRequiredSchema(): Promise<string[]> {
  const missing: string[] = [];
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
    try {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
      );
      const existing = new Set(rows.map((r: any) => String(r.column_name)));
      for (const col of requiredColumns) {
        if (!existing.has(col)) missing.push(`${tableName}.${col}`);
      }
    } catch (err: any) {
      missing.push(`${tableName} (table check failed: ${err.message})`);
    }
  }
  if (missing.length > 0) {
    console.error(
      "[Schema validator] STILL MISSING after ensureSchema — fix DB or check migration logs:",
      missing.join(", "),
    );
  } else {
    console.log("[Schema validator] Required schema columns present");
  }
  return missing;
}

async function patchStripeEnums() {
  // pg-node-migrations sends the full SQL file as one query(), so PostgreSQL
  // parses ALL statements at once. Any CREATE TABLE that references a user-defined
  // type fails at parse time if the type was scheduled to be created by an earlier
  // DO $$ block in the same file. Pre-creating the enums here as separate queries
  // guarantees they exist before the migration runner's parse step.
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS stripe`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE t.typname = 'subscription_status' AND n.nspname = 'stripe'
        ) THEN
          CREATE TYPE stripe.subscription_status AS ENUM (
            'trialing','active','canceled','incomplete',
            'incomplete_expired','past_due','unpaid'
          );
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE t.typname = 'invoice_status' AND n.nspname = 'stripe'
        ) THEN
          CREATE TYPE stripe.invoice_status AS ENUM (
            'draft','open','paid','uncollectible','void'
          );
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE t.typname = 'subscription_schedule_status' AND n.nspname = 'stripe'
        ) THEN
          CREATE TYPE stripe.subscription_schedule_status AS ENUM (
            'not_started','active','completed','released','canceled'
          );
        END IF;
      END $$;
    `);
    console.log("Stripe enum pre-patch complete");
  } catch (err: any) {
    console.error("Stripe enum pre-patch error:", err.message);
  }
}

const STRIPE_PLANS = [
  {
    name: "Starter",
    description: "Perfect for small nonprofits and churches just getting started.",
    metadata: { features: "1 bank account|Up to 500 transactions/month|Standard financial reports|Email support|Plaid bank sync", order: "1" },
    monthlyAmount: 2500,
    yearlyAmount: 24000,
  },
  {
    name: "Professional",
    description: "Full-featured accounting for growing nonprofits.",
    metadata: { features: "5 bank accounts|Unlimited transactions|Advanced reports & analytics|Priority support|Plaid bank sync|Multi-user access|Period close wizard", order: "2", featured: "true" },
    monthlyAmount: 4900,
    yearlyAmount: 48000,
  },
  {
    name: "Enterprise",
    description: "Unlimited scale for large organizations and networks.",
    metadata: { features: "Unlimited bank accounts|Unlimited transactions|Custom reports|Dedicated support|Plaid bank sync|Unlimited users|Multi-org management|API access", order: "3" },
    monthlyAmount: 9900,
    yearlyAmount: 96000,
  },
];

async function seedStripeProductsIfNeeded() {
  try {
    const stripe = await getUncachableStripeClient();
    const existingProducts = await stripe.products.list({ active: true, limit: 100 });
    const existingByName = new Map(existingProducts.data.map(p => [p.name, p]));

    for (const plan of STRIPE_PLANS) {
      let product = existingByName.get(plan.name);

      // Create missing product
      if (!product) {
        product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: plan.metadata as Record<string, string>,
        });
        console.log(`[Stripe seed] Created product: ${plan.name} (${product.id})`);
      }

      // Fetch active prices for this product
      const activePrices = await stripe.prices.list({ product: product.id, active: true });
      const monthlyPrice = activePrices.data.find(p => p.recurring?.interval === "month");
      const yearlyPrice  = activePrices.data.find(p => p.recurring?.interval === "year");

      // Fix monthly price if missing or wrong amount
      if (!monthlyPrice || monthlyPrice.unit_amount !== plan.monthlyAmount) {
        if (monthlyPrice) {
          await stripe.prices.update(monthlyPrice.id, { active: false });
          console.log(`[Stripe seed] Archived old monthly price for ${plan.name} ($${monthlyPrice.unit_amount! / 100})`);
        }
        const newMonthly = await stripe.prices.create({
          product: product.id, unit_amount: plan.monthlyAmount,
          currency: "usd", recurring: { interval: "month" },
        });
        console.log(`[Stripe seed] Created monthly price for ${plan.name}: $${plan.monthlyAmount / 100} (${newMonthly.id})`);
      }

      // Fix yearly price if missing or wrong amount
      if (!yearlyPrice || yearlyPrice.unit_amount !== plan.yearlyAmount) {
        if (yearlyPrice) {
          await stripe.prices.update(yearlyPrice.id, { active: false });
          console.log(`[Stripe seed] Archived old yearly price for ${plan.name}`);
        }
        const newYearly = await stripe.prices.create({
          product: product.id, unit_amount: plan.yearlyAmount,
          currency: "usd", recurring: { interval: "year" },
        });
        console.log(`[Stripe seed] Created yearly price for ${plan.name}: $${plan.yearlyAmount / 100} (${newYearly.id})`);
      }
    }
    console.log("[Stripe seed] Plans verified/updated");
  } catch (err: any) {
    console.error("Stripe plan seed error:", err.message);
  }
}

async function initStripe() {
  const hasConnector = !!process.env.REPLIT_CONNECTORS_HOSTNAME;
  const hasFallbackKey = !!process.env.STRIPE_SECRET_KEY;
  if (!hasConnector && !hasFallbackKey) {
    console.log("Stripe not configured — skipping initialization (no connector or STRIPE_SECRET_KEY)");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL!;
  try {
    await patchStripeEnums();
    console.log("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    console.log("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    // STRIPE_LIVE_SECRET_KEY means user-supplied live keys — skip the managed webhook proxy.
    const usingOwnKey = !!process.env.STRIPE_LIVE_SECRET_KEY;
    console.log(`[Stripe] Key mode: ${usingOwnKey ? "live (own keys)" : "managed connector"}`);
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      if (usingOwnKey) {
        // Live keys — managed webhook (mk_) proxy is incompatible.
        // Incoming webhooks are verified via STRIPE_LIVE_WEBHOOK_SECRET.
        console.log("[Stripe] Live mode — using STRIPE_LIVE_WEBHOOK_SECRET for webhook verification");
      } else {
        try {
          console.log("Setting up managed webhook at", webhookUrl);
          await stripeSync.findOrCreateManagedWebhook(webhookUrl);
          console.log("Stripe webhook configured");
        } catch (webhookErr: any) {
          // Non-fatal: webhook registration may fail in dev/misconfigured connector environments.
          console.warn("[Stripe] Managed webhook registration skipped:", webhookErr.message);
        }
      }
    }

    stripeSync.syncBackfill()
      .then(async () => {
        console.log("Stripe data synced");
        await seedStripeProductsIfNeeded();
      })
      .catch((err: any) => console.error("Stripe sync error:", err.message));
  } catch (err: any) {
    console.error("Stripe initialization failed:", err.message);
  }
}

/** One ALTER per query: Postgres runs multiple statements in one simple query as a single transaction — one failure rolls back all. */
async function ensureAlter(label: string, sql: string): Promise<void> {
  try {
    await pool.query(sql);
    console.log(`Schema check: ${label} OK`);
  } catch (err: any) {
    console.error(`Schema migration error (${label}):`, err.message);
  }
}

/** Required for API to start; failures must abort startup (not a silent log). */
async function ensureAlterThrow(label: string, sql: string): Promise<void> {
  try {
    await pool.query(sql);
    console.log(`Schema check: ${label} OK`);
  } catch (err: any) {
    console.error(`Schema migration FATAL (${label}):`, err);
    throw Object.assign(new Error(`Schema migration failed (${label}): ${err?.message ?? err}`), {
      cause: err,
    });
  }
}

async function assertColumnExists(tableName: string, columnName: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName],
  );
  if (!rows.length) {
    throw new Error(
      `Schema verification failed: public.${tableName}.${columnName} is still missing after ALTER. ` +
        `Check that DATABASE_URL points at this Postgres instance and the DB user can ALTER TABLE.`,
    );
  }
}

async function ensureSchema() {
  await pool.query(`SET search_path TO public, pg_catalog`);

  await ensureAlter(
    "donations.transaction_id",
    `ALTER TABLE donations ADD COLUMN IF NOT EXISTS transaction_id TEXT`,
  );

  // Must exist before startup: donations are read with an all-columns SELECT by the
  // dashboard and donations routes, so a schema/DB mismatch here breaks unrelated pages.
  await ensureAlterThrow(
    "donations.zeffy_event_id",
    `ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS zeffy_event_id TEXT`,
  );
  await assertColumnExists("donations", "zeffy_event_id");
  // Idempotency backstop: Zeffy retries failed deliveries for up to 3 days. The partial
  // index (NULLs excluded) makes a duplicate insert impossible even under a race between
  // two concurrent deliveries of the same event. Non-fatal so that pre-existing duplicate
  // rows cannot block startup; the application-level check still guards.
  await ensureAlter(
    "donations.zeffy_event_id unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS donations_company_zeffy_event_id_uidx
       ON public.donations (company_id, zeffy_event_id)
       WHERE zeffy_event_id IS NOT NULL`,
  );

  await ensureAlterThrow(
    "companies.zeffy_webhook_secret",
    `ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS zeffy_webhook_secret TEXT`,
  );
  await assertColumnExists("companies", "zeffy_webhook_secret");

  await ensureAlter(
    "bank_transactions.plaid_transaction_id",
    `ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT`,
  );

  // Run immediately: Drizzle SELECT lists vendor_id and other metadata on every /transactions call.
  await ensureAlterThrow(
    "transactions.plaid_transaction_id",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT`,
  );
  await ensureAlterThrow(
    "transactions.donor_name",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS donor_name TEXT`,
  );
  await ensureAlterThrow(
    "transactions.vendor_id",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS vendor_id TEXT`,
  );
  await ensureAlterThrow(
    "transactions.is_split",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_split BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await ensureAlterThrow("transactions.memo", `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS memo TEXT`);
  await ensureAlterThrow(
    "transactions.check_number",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS check_number TEXT`,
  );
  await ensureAlterThrow(
    "transactions.reference_number",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_number TEXT`,
  );
  await ensureAlterThrow(
    "transactions.functional_type",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS functional_type TEXT`,
  );
  await ensureAlterThrow(
    "transactions.transaction_fingerprint",
    `ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transaction_fingerprint TEXT`,
  );
  await assertColumnExists("transactions", "vendor_id");

  await ensureAlter(
    "bank_accounts.plaid_access_token",
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_access_token TEXT`,
  );
  await ensureAlter(
    "bank_accounts.plaid_item_id",
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_item_id TEXT`,
  );
  await ensureAlter(
    "bank_accounts.plaid_institution_name",
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_institution_name TEXT`,
  );
  await ensureAlter(
    "bank_accounts.is_plaid_linked",
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_plaid_linked BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await ensureAlter(
    "bank_accounts.plaid_last_synced_at",
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS plaid_last_synced_at TIMESTAMP`,
  );

  await ensureAlter(
    "enum gl_source_type",
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'gl_source_type' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE public.gl_source_type AS ENUM (
          'TRANSACTION', 'JOURNAL_ENTRY', 'OPENING_BALANCE', 'MANUAL_JE'
        );
      END IF;
    END $$`,
  );
  try {
    await pool.query(`ALTER TYPE gl_source_type ADD VALUE IF NOT EXISTS 'MANUAL_JE'`);
    console.log("Schema check: gl_source_type MANUAL_JE OK");
  } catch (err: any) {
    console.error("Schema migration error (gl_source_type):", err.message);
  }

  await ensureAlter(
    "enum gl_functional_type",
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'gl_functional_type' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE public.gl_functional_type AS ENUM (
          'PROGRAM_SERVICE', 'MANAGEMENT_GENERAL', 'FUNDRAISING'
        );
      END IF;
    END $$`,
  );

  // gl_entries — raw SQL reports (990-readiness, etc.) expect these columns; older DBs often lack them.
  await ensureAlter("gl_entries.transaction_id", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS transaction_id TEXT`);
  await ensureAlter("gl_entries.journal_entry_id", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS journal_entry_id TEXT`);
  await ensureAlter(
    "gl_entries.source_type",
    `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS source_type public.gl_source_type NOT NULL DEFAULT 'TRANSACTION'::public.gl_source_type`,
  );
  await ensureAlter("gl_entries.account_code", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS account_code TEXT`);
  await ensureAlter("gl_entries.account_name", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS account_name TEXT`);
  await ensureAlter("gl_entries.fund_id", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS fund_id TEXT`);
  await ensureAlter("gl_entries.fund_name", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS fund_name TEXT`);
  await ensureAlter("gl_entries.description", `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS description TEXT`);
  await ensureAlter(
    "gl_entries.functional_type",
    `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS functional_type public.gl_functional_type`,
  );
  await ensureAlter(
    "gl_entries.created_at",
    `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  );
  await ensureAlter(
    "gl_entries.updated_at",
    `ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  );
  try {
    await pool.query(`
      UPDATE gl_entries g
      SET
        account_code = c.code,
        account_name = c.name
      FROM chart_of_accounts c
      WHERE c.id = g.account_id
        AND c.company_id = g.company_id
        AND (g.account_code IS NULL OR TRIM(g.account_code) = '' OR g.account_name IS NULL OR TRIM(g.account_name) = '')
    `);
    console.log("Schema check: gl_entries account_code/name backfill OK");
  } catch (err: any) {
    console.error("Schema migration error (gl_entries backfill account):", err.message);
  }
  try {
    await pool.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference_number TEXT`);
    console.log("Schema check: journal_entries.reference_number OK");
  } catch (err: any) {
    console.error("Schema migration error (reference_number):", err.message);
  }
  // Defense-in-depth backstop for the advisory-lock-based number allocation in
  // withCompanyJournalLock. Non-fatal: if any duplicate numbers already exist
  // from before that fix, this just fails to apply rather than blocking startup.
  await ensureAlter(
    "journal_entries.entry_number unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_company_entry_number_unique
       ON public.journal_entries (company_id, entry_number)`,
  );
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log("Schema check: companies.maintenance_mode OK");
  } catch (err: any) {
    console.error("Schema migration error (maintenance_mode):", err.message);
  }
  await ensureAlter(
    "companies.is_comped",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_comped BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await ensureAlter("companies.comped_note", `ALTER TABLE companies ADD COLUMN IF NOT EXISTS comped_note TEXT`);

  await ensureAlter(
    "enum accounting_method",
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'accounting_method' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE public.accounting_method AS ENUM ('CASH', 'ACCRUAL');
      END IF;
    END $$`,
  );
  await ensureAlter(
    "companies.accounting_method",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS accounting_method public.accounting_method NOT NULL DEFAULT 'CASH'::public.accounting_method`,
  );
  await ensureAlter(
    "companies.fiscal_year_end_month",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_year_end_month TEXT NOT NULL DEFAULT '12'`,
  );
  await ensureAlter("companies.closed_until", `ALTER TABLE companies ADD COLUMN IF NOT EXISTS closed_until TIMESTAMP`);
  await ensureAlter(
    "companies.donations_enabled",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS donations_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await ensureAlter("companies.zeffy_form_url", `ALTER TABLE companies ADD COLUMN IF NOT EXISTS zeffy_form_url TEXT`);
  await ensureAlter(
    "companies.opening_balance_entry_id",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS opening_balance_entry_id TEXT`,
  );
  await ensureAlter(
    "companies.opening_balance_date",
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS opening_balance_date TIMESTAMP`,
  );

  await ensureAlter(
    "enum fund_type",
    `DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'fund_type' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE public.fund_type AS ENUM (
          'UNRESTRICTED',
          'RESTRICTED_TEMP',
          'RESTRICTED_PERM',
          'BOARD_DESIGNATED'
        );
      END IF;
    END $$`,
  );
  await ensureAlter(
    "funds.fund_type",
    `ALTER TABLE funds ADD COLUMN IF NOT EXISTS fund_type public.fund_type NOT NULL DEFAULT 'UNRESTRICTED'`,
  );
  await ensureAlter(
    "system_settings table",
    `CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  );
  try {
    await pool.query(`
      INSERT INTO system_settings (key, value) VALUES ('global_maintenance_mode', 'false')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log("Schema check: system_settings seed OK");
  } catch (err: any) {
    console.error("Schema migration error (system_settings seed):", err.message);
  }

  // organization_users is required for org membership lookups during login
  // and for the org switcher endpoints.
  await ensureAlter(
    "organization_users table",
    `CREATE TABLE IF NOT EXISTS organization_users (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      role "role" NOT NULL DEFAULT 'VIEWER',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      invited_by TEXT,
      joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  );
  await ensureAlter(
    "organization_users unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS org_users_user_company_unique ON organization_users (user_id, company_id)`,
  );

  // password_reset_tokens was added to the Drizzle schema but never carried over
  // into production by any migration or this file, so /forgot-password has been
  // failing with "relation does not exist" since the feature shipped.
  await ensureAlter(
    "password_reset_tokens table",
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  );
  await ensureAlter(
    "password_reset_tokens token unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_unique ON password_reset_tokens (token)`,
  );

  // Giver/member directory (Phase 2) — a real donor entity, separate from the
  // free-text donorName fields on donations/pledges, which stay as-is.
  await ensureAlter(
    "donors table",
    `CREATE TABLE IF NOT EXISTS donors (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  );
  await ensureAlter("donations.donor_id", `ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_id TEXT`);
  await ensureAlter("pledges.donor_id", `ALTER TABLE pledges ADD COLUMN IF NOT EXISTS donor_id TEXT`);

  // Pledge/giving campaigns (Phase 3) — a named goal individual pledges can roll up under.
  await ensureAlter(
    "pledge_campaigns table",
    `CREATE TABLE IF NOT EXISTS pledge_campaigns (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      fund_id TEXT,
      goal_amount NUMERIC(15,2) NOT NULL,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
  );
  await ensureAlter("pledges.campaign_id", `ALTER TABLE pledges ADD COLUMN IF NOT EXISTS campaign_id TEXT`);

  try {
    await pool.query(`ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'OFFICER'`);
    console.log("Schema check: role.OFFICER OK");
  } catch (err: any) {
    console.error("Schema migration error (role OFFICER):", err.message);
  }

  await ensureAlter("users.is_platform_admin", `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE`);

  // users.user_id — split steps so one failure does not roll back ADD COLUMN.
  await ensureAlter("users.user_id column", `ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id TEXT`);
  try {
    await pool.query(`
      WITH seeds AS (
        SELECT
          id,
          LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_\\-]', '', 'g')) AS base_user_id,
          company_id,
          ROW_NUMBER() OVER (
            PARTITION BY company_id, LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_\\-]', '', 'g'))
            ORDER BY created_at, id
          ) AS rn
        FROM users
        WHERE user_id IS NULL OR LENGTH(TRIM(user_id)) = 0
      )
      UPDATE users u
      SET user_id = CASE
        WHEN s.rn = 1 THEN COALESCE(NULLIF(s.base_user_id, ''), 'user_' || SUBSTRING(u.id, 1, 8))
        ELSE COALESCE(NULLIF(s.base_user_id, ''), 'user') || '_' || s.rn::text
      END
      FROM seeds s
      WHERE u.id = s.id
    `);
    console.log("Schema check: users.user_id backfill OK");
  } catch (err: any) {
    console.error("Schema migration error (users.user_id backfill):", err.message);
  }
  await ensureAlter("users.user_id set not null", `ALTER TABLE users ALTER COLUMN user_id SET NOT NULL`);
  await ensureAlter(
    "users company_user_id unique index",
    `CREATE UNIQUE INDEX IF NOT EXISTS users_company_user_id_unique ON users (company_id, user_id)`,
  );
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coa_templates (
        code VARCHAR(20) PRIMARY KEY,
        name TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        parent_code VARCHAR(20),
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Pre-populate from default COA if table is empty
    const { rows: existing } = await pool.query(`SELECT COUNT(*) AS cnt FROM coa_templates`);
    if (parseInt(existing[0].cnt) === 0) {
      await pool.query(`
        INSERT INTO coa_templates (code, name, type, parent_code, sort_order) VALUES
          ('1000','Cash and Bank Accounts','ASSET',NULL,1000),
          ('1010','Checking Account','ASSET','1000',1010),
          ('1020','Savings Account','ASSET','1000',1020),
          ('1100','Accounts Receivable','ASSET',NULL,1100),
          ('1200','Pledges Receivable','ASSET',NULL,1200),
          ('1500','Fixed Assets','ASSET',NULL,1500),
          ('2000','Accounts Payable','LIABILITY',NULL,2000),
          ('2100','Accrued Expenses','LIABILITY',NULL,2100),
          ('3000','Net Assets','EQUITY',NULL,3000),
          ('3100','Unrestricted Net Assets','EQUITY',NULL,3100),
          ('3200','Restricted Net Assets','EQUITY',NULL,3200),
          ('4000','Revenue','INCOME',NULL,4000),
          ('4100','Donations','INCOME','4000',4100),
          ('4200','Grants','INCOME','4000',4200),
          ('4300','Program Revenue','INCOME','4000',4300),
          ('4400','Membership Dues','INCOME','4000',4400),
          ('5000','Expenses','EXPENSE',NULL,5000),
          ('5100','Salaries and Wages','EXPENSE','5000',5100),
          ('5200','Rent and Occupancy','EXPENSE','5000',5200),
          ('5300','Office Supplies','EXPENSE','5000',5300),
          ('5400','Utilities','EXPENSE','5000',5400),
          ('5500','Program Expenses','EXPENSE','5000',5500),
          ('5600','Marketing and Communications','EXPENSE','5000',5600),
          ('5700','Professional Services','EXPENSE','5000',5700),
          ('5800','Travel and Transportation','EXPENSE','5000',5800),
          ('5900','Miscellaneous Expenses','EXPENSE','5000',5900)
        ON CONFLICT (code) DO NOTHING;
      `);
    }
    console.log("Schema check: coa_templates OK");
  } catch (err: any) {
    console.error("Schema migration error (coa_templates):", err.message);
  }
  // Church support: make coa_templates organization-type-aware so seedChartOfAccounts
  // (chart-of-accounts.ts) can pick a template by org type. `code` is now only unique
  // within an organization_type, not globally — hence dropping the old single-column PK.
  try {
    await pool.query(
      `ALTER TABLE coa_templates ADD COLUMN IF NOT EXISTS organization_type organization_type NOT NULL DEFAULT 'NONPROFIT'`,
    );
    await pool.query(`ALTER TABLE coa_templates DROP CONSTRAINT IF EXISTS coa_templates_pkey`);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS coa_templates_org_type_code_unique ON coa_templates (organization_type, code)`,
    );

    // Re-sync the NONPROFIT template to the richer list seedChartOfAccounts actually
    // uses (chart-of-accounts.ts DEFAULT_COA) — the original seed above predates that
    // list and is missing most of it.
    await pool.query(`
      INSERT INTO coa_templates (organization_type, code, name, type, parent_code, sort_order) VALUES
        ('NONPROFIT','1000','Cash & Bank Accounts','ASSET',NULL,10),
        ('NONPROFIT','1010','Checking Account','ASSET','1000',11),
        ('NONPROFIT','1020','Savings Account','ASSET','1000',12),
        ('NONPROFIT','1100','Accounts Receivable','ASSET',NULL,20),
        ('NONPROFIT','1200','Pledges Receivable','ASSET',NULL,30),
        ('NONPROFIT','1500','Property & Equipment','ASSET',NULL,40),
        ('NONPROFIT','2000','Accounts Payable','LIABILITY',NULL,110),
        ('NONPROFIT','2100','Accrued Liabilities','LIABILITY',NULL,120),
        ('NONPROFIT','2200','Deferred Revenue','LIABILITY',NULL,130),
        ('NONPROFIT','3000','Net Assets','EQUITY',NULL,210),
        ('NONPROFIT','3100','Unrestricted Net Assets','EQUITY',NULL,211),
        ('NONPROFIT','3200','Temporarily Restricted','EQUITY',NULL,212),
        ('NONPROFIT','3300','Permanently Restricted','EQUITY',NULL,213),
        ('NONPROFIT','4000','Revenue','INCOME',NULL,310),
        ('NONPROFIT','4100','Individual Contributions','INCOME','4000',311),
        ('NONPROFIT','4110','Online Donations','INCOME','4000',312),
        ('NONPROFIT','4120','Cash Offerings','INCOME','4000',313),
        ('NONPROFIT','4130','Check Donations','INCOME','4000',314),
        ('NONPROFIT','4200','Grants','INCOME','4000',320),
        ('NONPROFIT','4210','Government Grants','INCOME','4000',321),
        ('NONPROFIT','4220','Foundation Grants','INCOME','4000',322),
        ('NONPROFIT','4300','Membership Dues','INCOME','4000',330),
        ('NONPROFIT','4400','Program Revenue','INCOME','4000',340),
        ('NONPROFIT','4500','Special Events Revenue','INCOME','4000',350),
        ('NONPROFIT','4600','In-Kind Contributions','INCOME','4000',360),
        ('NONPROFIT','4700','Investment Income','INCOME','4000',370),
        ('NONPROFIT','4800','Rental Income','INCOME','4000',380),
        ('NONPROFIT','4900','Miscellaneous Income','INCOME','4000',390),
        ('NONPROFIT','8000','Expenses','EXPENSE',NULL,410),
        ('NONPROFIT','8100','Personnel Expenses','EXPENSE','8000',411),
        ('NONPROFIT','8110','Salaries & Wages','EXPENSE','8100',412),
        ('NONPROFIT','8120','Payroll Taxes','EXPENSE','8100',413),
        ('NONPROFIT','8130','Employee Benefits','EXPENSE','8100',414),
        ('NONPROFIT','8140','Contract Labor','EXPENSE','8100',415),
        ('NONPROFIT','8200','Occupancy & Facilities','EXPENSE','8000',420),
        ('NONPROFIT','8210','Rent & Lease','EXPENSE','8200',421),
        ('NONPROFIT','8220','Utilities','EXPENSE','8200',422),
        ('NONPROFIT','8230','Maintenance & Repairs','EXPENSE','8200',423),
        ('NONPROFIT','8300','Program Expenses','EXPENSE','8000',430),
        ('NONPROFIT','8310','Program Supplies','EXPENSE','8300',431),
        ('NONPROFIT','8320','Program Services','EXPENSE','8300',432),
        ('NONPROFIT','8400','Administrative Expenses','EXPENSE','8000',440),
        ('NONPROFIT','8410','Office Supplies','EXPENSE','8400',441),
        ('NONPROFIT','8420','Postage & Shipping','EXPENSE','8400',442),
        ('NONPROFIT','8430','Printing & Copying','EXPENSE','8400',443),
        ('NONPROFIT','8440','Software & Technology','EXPENSE','8400',444),
        ('NONPROFIT','8500','Professional Services','EXPENSE','8000',450),
        ('NONPROFIT','8510','Accounting & Audit','EXPENSE','8500',451),
        ('NONPROFIT','8520','Legal Fees','EXPENSE','8500',452),
        ('NONPROFIT','8530','Consulting Fees','EXPENSE','8500',453),
        ('NONPROFIT','8600','Travel & Transportation','EXPENSE','8000',460),
        ('NONPROFIT','8610','Mileage & Vehicle','EXPENSE','8600',461),
        ('NONPROFIT','8620','Airfare & Lodging','EXPENSE','8600',462),
        ('NONPROFIT','8700','Marketing & Communications','EXPENSE','8000',470),
        ('NONPROFIT','8710','Advertising','EXPENSE','8700',471),
        ('NONPROFIT','8720','Website & Social Media','EXPENSE','8700',472),
        ('NONPROFIT','8800','Fundraising Expenses','EXPENSE','8000',480),
        ('NONPROFIT','8900','Depreciation','EXPENSE','8000',490),
        ('NONPROFIT','8950','Insurance','EXPENSE','8000',491),
        ('NONPROFIT','8990','Miscellaneous Expenses','EXPENSE','8000',499)
      ON CONFLICT (organization_type, code) DO NOTHING;
    `);

    // CHURCH template: same asset/liability/equity backbone, church-specific income/expense.
    await pool.query(`
      INSERT INTO coa_templates (organization_type, code, name, type, parent_code, sort_order) VALUES
        ('CHURCH','1000','Cash & Bank Accounts','ASSET',NULL,10),
        ('CHURCH','1010','Checking Account','ASSET','1000',11),
        ('CHURCH','1020','Savings Account','ASSET','1000',12),
        ('CHURCH','1100','Accounts Receivable','ASSET',NULL,20),
        ('CHURCH','1200','Pledges Receivable','ASSET',NULL,30),
        ('CHURCH','1500','Property & Equipment','ASSET',NULL,40),
        ('CHURCH','2000','Accounts Payable','LIABILITY',NULL,110),
        ('CHURCH','2100','Accrued Liabilities','LIABILITY',NULL,120),
        ('CHURCH','2200','Deferred Revenue','LIABILITY',NULL,130),
        ('CHURCH','3000','Net Assets','EQUITY',NULL,210),
        ('CHURCH','3100','Unrestricted Net Assets','EQUITY',NULL,211),
        ('CHURCH','3200','Temporarily Restricted','EQUITY',NULL,212),
        ('CHURCH','3300','Permanently Restricted','EQUITY',NULL,213),
        ('CHURCH','4000','Revenue','INCOME',NULL,310),
        ('CHURCH','4100','Tithes & Offerings','INCOME','4000',311),
        ('CHURCH','4110','Online & Mobile Giving','INCOME','4000',312),
        ('CHURCH','4120','Plate & Loose Offering','INCOME','4000',313),
        ('CHURCH','4200','Building Fund / Capital Campaign','INCOME','4000',320),
        ('CHURCH','4300','Missions & Outreach Giving','INCOME','4000',330),
        ('CHURCH','4400','Designated & Restricted Gifts','INCOME','4000',340),
        ('CHURCH','4500','Fundraising & Events Revenue','INCOME','4000',350),
        ('CHURCH','4600','In-Kind Contributions','INCOME','4000',360),
        ('CHURCH','4700','Investment Income','INCOME','4000',370),
        ('CHURCH','4800','Facility Rental Income','INCOME','4000',380),
        ('CHURCH','4900','Miscellaneous Income','INCOME','4000',390),
        ('CHURCH','8000','Expenses','EXPENSE',NULL,410),
        ('CHURCH','8100','Personnel Expenses','EXPENSE','8000',411),
        ('CHURCH','8110','Pastoral Staff Salaries','EXPENSE','8100',412),
        ('CHURCH','8115','Clergy Housing Allowance','EXPENSE','8100',413),
        ('CHURCH','8120','Ministry Staff Salaries','EXPENSE','8100',414),
        ('CHURCH','8130','Payroll Taxes','EXPENSE','8100',415),
        ('CHURCH','8140','Employee Benefits','EXPENSE','8100',416),
        ('CHURCH','8150','Guest Speakers & Contract Labor','EXPENSE','8100',417),
        ('CHURCH','8200','Occupancy & Facilities','EXPENSE','8000',420),
        ('CHURCH','8210','Mortgage / Rent','EXPENSE','8200',421),
        ('CHURCH','8220','Utilities','EXPENSE','8200',422),
        ('CHURCH','8230','Maintenance & Repairs','EXPENSE','8200',423),
        ('CHURCH','8240','Property Insurance','EXPENSE','8200',424),
        ('CHURCH','8300','Ministry Programs','EXPENSE','8000',430),
        ('CHURCH','8310','Worship & Music Ministry','EXPENSE','8300',431),
        ('CHURCH','8320','Christian Education / Sunday School','EXPENSE','8300',432),
        ('CHURCH','8330','Youth Ministry','EXPENSE','8300',433),
        ('CHURCH','8340','Missions & Benevolence','EXPENSE','8300',434),
        ('CHURCH','8350','Outreach & Evangelism','EXPENSE','8300',435),
        ('CHURCH','8400','Administrative Expenses','EXPENSE','8000',440),
        ('CHURCH','8410','Office Supplies','EXPENSE','8400',441),
        ('CHURCH','8420','Postage & Shipping','EXPENSE','8400',442),
        ('CHURCH','8430','Printing & Copying','EXPENSE','8400',443),
        ('CHURCH','8440','Software & Technology','EXPENSE','8400',444),
        ('CHURCH','8500','Professional Services','EXPENSE','8000',450),
        ('CHURCH','8510','Accounting & Audit','EXPENSE','8500',451),
        ('CHURCH','8520','Legal Fees','EXPENSE','8500',452),
        ('CHURCH','8600','Denominational Dues & Assessments','EXPENSE','8000',460),
        ('CHURCH','8700','Travel & Transportation','EXPENSE','8000',470),
        ('CHURCH','8800','Fundraising & Event Expenses','EXPENSE','8000',480),
        ('CHURCH','8900','Depreciation','EXPENSE','8000',490),
        ('CHURCH','8990','Miscellaneous Expenses','EXPENSE','8000',499)
      ON CONFLICT (organization_type, code) DO NOTHING;
    `);

    // MEMBERSHIP template (associations/clubs): same backbone, income from dues/events/
    // sponsorships rather than donations. Most of these orgs are 501(c)(7), not 501(c)(3) —
    // no "Individual Contributions"/"Grants" framing here.
    await pool.query(`
      INSERT INTO coa_templates (organization_type, code, name, type, parent_code, sort_order) VALUES
        ('MEMBERSHIP','1000','Cash & Bank Accounts','ASSET',NULL,10),
        ('MEMBERSHIP','1010','Checking Account','ASSET','1000',11),
        ('MEMBERSHIP','1020','Savings Account','ASSET','1000',12),
        ('MEMBERSHIP','1100','Accounts Receivable','ASSET',NULL,20),
        ('MEMBERSHIP','1200','Dues Receivable','ASSET',NULL,30),
        ('MEMBERSHIP','1500','Property & Equipment','ASSET',NULL,40),
        ('MEMBERSHIP','2000','Accounts Payable','LIABILITY',NULL,110),
        ('MEMBERSHIP','2100','Accrued Liabilities','LIABILITY',NULL,120),
        ('MEMBERSHIP','2200','Deferred Revenue','LIABILITY',NULL,130),
        ('MEMBERSHIP','2300','Deferred Membership Dues','LIABILITY',NULL,140),
        ('MEMBERSHIP','3000','Net Assets','EQUITY',NULL,210),
        ('MEMBERSHIP','3100','Unrestricted Net Assets','EQUITY',NULL,211),
        ('MEMBERSHIP','3200','Temporarily Restricted','EQUITY',NULL,212),
        ('MEMBERSHIP','3300','Permanently Restricted','EQUITY',NULL,213),
        ('MEMBERSHIP','4000','Revenue','INCOME',NULL,310),
        ('MEMBERSHIP','4100','Membership Dues','INCOME','4000',311),
        ('MEMBERSHIP','4110','New Member Dues','INCOME','4000',312),
        ('MEMBERSHIP','4120','Renewal Dues','INCOME','4000',313),
        ('MEMBERSHIP','4200','Event & Conference Revenue','INCOME','4000',320),
        ('MEMBERSHIP','4300','Sponsorships','INCOME','4000',330),
        ('MEMBERSHIP','4400','Fundraising Revenue','INCOME','4000',340),
        ('MEMBERSHIP','4500','Merchandise Sales','INCOME','4000',350),
        ('MEMBERSHIP','4600','Advertising Revenue','INCOME','4000',360),
        ('MEMBERSHIP','4700','Investment Income','INCOME','4000',370),
        ('MEMBERSHIP','4900','Miscellaneous Income','INCOME','4000',390),
        ('MEMBERSHIP','8000','Expenses','EXPENSE',NULL,410),
        ('MEMBERSHIP','8100','Personnel Expenses','EXPENSE','8000',411),
        ('MEMBERSHIP','8110','Salaries & Wages','EXPENSE','8100',412),
        ('MEMBERSHIP','8120','Payroll Taxes','EXPENSE','8100',413),
        ('MEMBERSHIP','8130','Employee Benefits','EXPENSE','8100',414),
        ('MEMBERSHIP','8140','Contract Labor','EXPENSE','8100',415),
        ('MEMBERSHIP','8200','Occupancy & Facilities','EXPENSE','8000',420),
        ('MEMBERSHIP','8210','Rent & Lease','EXPENSE','8200',421),
        ('MEMBERSHIP','8220','Utilities','EXPENSE','8200',422),
        ('MEMBERSHIP','8230','Maintenance & Repairs','EXPENSE','8200',423),
        ('MEMBERSHIP','8300','Member Programs & Events','EXPENSE','8000',430),
        ('MEMBERSHIP','8310','Conference & Event Expenses','EXPENSE','8300',431),
        ('MEMBERSHIP','8320','Member Communications','EXPENSE','8300',432),
        ('MEMBERSHIP','8330','Chapter & Affiliate Support','EXPENSE','8300',433),
        ('MEMBERSHIP','8400','Administrative Expenses','EXPENSE','8000',440),
        ('MEMBERSHIP','8410','Office Supplies','EXPENSE','8400',441),
        ('MEMBERSHIP','8420','Postage & Shipping','EXPENSE','8400',442),
        ('MEMBERSHIP','8430','Printing & Copying','EXPENSE','8400',443),
        ('MEMBERSHIP','8440','Software & Technology','EXPENSE','8400',444),
        ('MEMBERSHIP','8500','Professional Services','EXPENSE','8000',450),
        ('MEMBERSHIP','8510','Accounting & Audit','EXPENSE','8500',451),
        ('MEMBERSHIP','8520','Legal Fees','EXPENSE','8500',452),
        ('MEMBERSHIP','8600','Travel & Transportation','EXPENSE','8000',460),
        ('MEMBERSHIP','8700','Marketing & Communications','EXPENSE','8000',470),
        ('MEMBERSHIP','8800','Fundraising & Event Expenses','EXPENSE','8000',480),
        ('MEMBERSHIP','8900','Depreciation','EXPENSE','8000',490),
        ('MEMBERSHIP','8950','Insurance','EXPENSE','8000',491),
        ('MEMBERSHIP','8990','Miscellaneous Expenses','EXPENSE','8000',499)
      ON CONFLICT (organization_type, code) DO NOTHING;
    `);

    console.log("Schema check: coa_templates organization_type + CHURCH/MEMBERSHIP templates OK");
  } catch (err: any) {
    console.error("Schema migration error (coa_templates organization_type):", err.message);
  }
  // Backfill: add any missing default COA accounts to companies that were seeded before the full COA was introduced
  try {
    await pool.query(`
      INSERT INTO chart_of_accounts (id, company_id, code, name, coa_type, is_system, is_active, sort_order, created_at, updated_at)
      SELECT gen_random_uuid(), c.id, acct.code, acct.name, acct.coa_type::coa_type, true, true, acct.sort_order::int, NOW(), NOW()
      FROM companies c
      CROSS JOIN (VALUES
        ('1000','Cash & Bank Accounts','ASSET',10),
        ('1010','Checking Account','ASSET',11),
        ('1020','Savings Account','ASSET',12),
        ('1100','Accounts Receivable','ASSET',20),
        ('1200','Pledges Receivable','ASSET',30),
        ('1500','Property & Equipment','ASSET',40),
        ('2000','Accounts Payable','LIABILITY',110),
        ('2100','Accrued Liabilities','LIABILITY',120),
        ('2200','Deferred Revenue','LIABILITY',130),
        ('3000','Net Assets','EQUITY',210),
        ('3100','Unrestricted Net Assets','EQUITY',211),
        ('3200','Temporarily Restricted','EQUITY',212),
        ('3300','Permanently Restricted','EQUITY',213),
        ('4000','Revenue','INCOME',310),
        ('4100','Individual Contributions','INCOME',311),
        ('4110','Online Donations','INCOME',312),
        ('4120','Cash Offerings','INCOME',313),
        ('4130','Check Donations','INCOME',314),
        ('4200','Grants','INCOME',320),
        ('4210','Government Grants','INCOME',321),
        ('4220','Foundation Grants','INCOME',322),
        ('4300','Membership Dues','INCOME',330),
        ('4400','Program Revenue','INCOME',340),
        ('4500','Special Events Revenue','INCOME',350),
        ('4600','In-Kind Contributions','INCOME',360),
        ('4700','Investment Income','INCOME',370),
        ('4800','Rental Income','INCOME',380),
        ('4900','Miscellaneous Income','INCOME',390),
        ('8000','Expenses','EXPENSE',410),
        ('8100','Personnel Expenses','EXPENSE',411),
        ('8110','Salaries & Wages','EXPENSE',412),
        ('8120','Payroll Taxes','EXPENSE',413),
        ('8130','Employee Benefits','EXPENSE',414),
        ('8140','Contract Labor','EXPENSE',415),
        ('8200','Occupancy & Facilities','EXPENSE',420),
        ('8210','Rent & Lease','EXPENSE',421),
        ('8220','Utilities','EXPENSE',422),
        ('8230','Maintenance & Repairs','EXPENSE',423),
        ('8300','Program Expenses','EXPENSE',430),
        ('8310','Program Supplies','EXPENSE',431),
        ('8320','Program Services','EXPENSE',432),
        ('8400','Administrative Expenses','EXPENSE',440),
        ('8410','Office Supplies','EXPENSE',441),
        ('8420','Postage & Shipping','EXPENSE',442),
        ('8430','Printing & Copying','EXPENSE',443),
        ('8440','Software & Technology','EXPENSE',444),
        ('8500','Professional Services','EXPENSE',450),
        ('8510','Accounting & Audit','EXPENSE',451),
        ('8520','Legal Fees','EXPENSE',452),
        ('8530','Consulting Fees','EXPENSE',453),
        ('8600','Travel & Transportation','EXPENSE',460),
        ('8610','Mileage & Vehicle','EXPENSE',461),
        ('8620','Airfare & Lodging','EXPENSE',462),
        ('8700','Marketing & Communications','EXPENSE',470),
        ('8710','Advertising','EXPENSE',471),
        ('8720','Website & Social Media','EXPENSE',472),
        ('8800','Fundraising Expenses','EXPENSE',480),
        ('8900','Depreciation','EXPENSE',490),
        ('8950','Insurance','EXPENSE',491),
        ('8990','Miscellaneous Expenses','EXPENSE',499)
      ) AS acct(code, name, coa_type, sort_order)
      WHERE
        -- only for companies that have been seeded (have at least one COA account)
        EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.company_id = c.id)
        -- skip accounts the company already has
        AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.company_id = c.id AND ca.code = acct.code)
    `);
    console.log("Schema check: COA backfill OK");
  } catch (err: any) {
    console.error("Schema migration error (COA backfill):", err.message);
  }

  // ── Migrate real → numeric(15,2) for all monetary columns ─────────────────
  // This fixes floating-point rounding errors ($0.01 discrepancies) in financial statements.
  // The USING clause safely converts existing float4 data to exact decimal storage.
  try {
    const monetaryAlterations = [
      "ALTER TABLE transactions      ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE gl_entries        ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE transaction_splits ALTER COLUMN amount             TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE donations         ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE expenses          ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE bills             ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE bill_payments     ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE pledges           ALTER COLUMN total_amount        TYPE numeric(15,2) USING total_amount::numeric(15,2)",
      "ALTER TABLE pledges           ALTER COLUMN paid_amount         TYPE numeric(15,2) USING paid_amount::numeric(15,2)",
      "ALTER TABLE budget_lines      ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
      "ALTER TABLE reconciliations   ALTER COLUMN statement_balance   TYPE numeric(15,2) USING statement_balance::numeric(15,2)",
      "ALTER TABLE reconciliations   ALTER COLUMN opening_balance     TYPE numeric(15,2) USING opening_balance::numeric(15,2)",
      "ALTER TABLE reconciliations   ALTER COLUMN cleared_balance     TYPE numeric(15,2) USING cleared_balance::numeric(15,2)",
      "ALTER TABLE reconciliations   ALTER COLUMN difference          TYPE numeric(15,2) USING difference::numeric(15,2)",
      "ALTER TABLE bank_accounts     ALTER COLUMN current_balance     TYPE numeric(15,2) USING current_balance::numeric(15,2)",
      "ALTER TABLE bank_transactions ALTER COLUMN amount              TYPE numeric(15,2) USING amount::numeric(15,2)",
    ];
    for (const stmt of monetaryAlterations) {
      try {
        await pool.query(stmt);
      } catch (e: any) {
        // "cannot alter type" means already numeric — safe to ignore
        if (!e.message?.includes("cannot alter type") && !e.message?.includes("already exists")) {
          throw e;
        }
      }
    }
    console.log("Schema check: monetary columns → numeric(15,2) OK");
  } catch (err: any) {
    console.error("Schema migration error (numeric conversion):", err.message);
  }

  try {
    await pool.query(
      "ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS monthly_amounts jsonb",
    );
    console.log("Schema check: budget_lines.monthly_amounts OK");
  } catch (err: any) {
    console.error("Schema migration error (budget_lines.monthly_amounts):", err.message);
  }

  try {
    await pool.query(
      "ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS fund_id text",
    );
    console.log("Schema check: budget_lines.fund_id OK");
  } catch (err: any) {
    console.error("Schema migration error (budget_lines.fund_id):", err.message);
  }

  try {
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE risk_status AS ENUM ('GREEN', 'YELLOW', 'RED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE committee_type AS ENUM ('FINANCE', 'AUDIT', 'GOVERNANCE', 'EXECUTIVE', 'PROGRAM', 'OTHER');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS program_metrics (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        period_year INTEGER NOT NULL,
        period_quarter INTEGER NOT NULL,
        target_value NUMERIC(15,2) NOT NULL DEFAULT 0,
        actual_value NUMERIC(15,2) NOT NULL DEFAULT 0,
        unit TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategic_risks (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status risk_status NOT NULL DEFAULT 'GREEN',
        owner_name TEXT,
        review_date TIMESTAMP,
        mitigation TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS committee_updates (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL,
        committee_type committee_type NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        meeting_date TIMESTAMP,
        author_name TEXT NOT NULL,
        author_email TEXT,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Schema check: board governance tables OK");
  } catch (err: any) {
    console.error("Schema migration error (board governance):", err.message);
  }

  // ── Repair GL imbalances caused by float→numeric rounding ─────────────────
  // When real (float32) values are converted to numeric(15,2), entries that share
  // the same source_id (journal entry) can round asymmetrically and break the
  // debit=credit invariant. We fix this by finding groups where the imbalance is
  // ≤ $0.05 (unambiguously a rounding artifact) and applying a compensating
  // adjustment to the most recent entry in that group.
  try {
    // GL entries are grouped by journal_entry_id (for JEs) or transaction_id (for transactions).
    // We use COALESCE to get a single group key per double-entry pair.
    const repairResult = await pool.query(`
      WITH imbalanced AS (
        SELECT
          company_id,
          COALESCE(journal_entry_id, transaction_id) AS group_key,
          ROUND(
            SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END)
          - SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END),
          4) AS delta
        FROM gl_entries
        WHERE is_void = false
          AND COALESCE(journal_entry_id, transaction_id) IS NOT NULL
        GROUP BY company_id, COALESCE(journal_entry_id, transaction_id)
      ),
      to_adjust AS (
        SELECT
          i.company_id, i.group_key, i.delta,
          (
            SELECT g.id FROM gl_entries g
            WHERE g.company_id = i.company_id
              AND COALESCE(g.journal_entry_id, g.transaction_id) = i.group_key
              AND g.is_void = false
            ORDER BY g.created_at DESC
            LIMIT 1
          ) AS last_entry_id
        FROM imbalanced i
        WHERE ABS(i.delta) > 0 AND ABS(i.delta) <= 2.00
      )
      UPDATE gl_entries g
      SET amount = ROUND(
        g.amount + (CASE WHEN g.entry_type = 'CREDIT' THEN ta.delta ELSE -ta.delta END),
        2
      )
      FROM to_adjust ta
      WHERE g.id = ta.last_entry_id
        AND ROUND(g.amount + (CASE WHEN g.entry_type = 'CREDIT' THEN ta.delta ELSE -ta.delta END), 2) >= 0
    `);
    if (repairResult.rowCount && repairResult.rowCount > 0) {
      console.log(`Schema check: GL balance repair — fixed ${repairResult.rowCount} rounding artifact(s)`);
    } else {
      console.log("Schema check: GL balance repair — no imbalances found");
    }
  } catch (err: any) {
    console.error("Schema migration error (GL balance repair):", err.message);
  }

  // custom_report_templates
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_report_templates (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        config      TEXT NOT NULL DEFAULT '{}',
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Schema check: custom_report_templates OK");
  } catch (err: any) {
    console.error("Schema migration error (custom_report_templates):", err.message);
  }

  await ensureAlter(
    "transaction_splits.fund_id",
    `ALTER TABLE transaction_splits ADD COLUMN IF NOT EXISTS fund_id TEXT`,
  );

  // reconciliations + reconciliation_items
  try {
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliation_status') THEN
          CREATE TYPE reconciliation_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'VOID');
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliations (
        id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        TEXT NOT NULL,
        bank_account_id   TEXT NOT NULL,
        statement_date    TIMESTAMP NOT NULL,
        statement_balance NUMERIC(15,2) NOT NULL,
        opening_balance   NUMERIC(15,2) NOT NULL DEFAULT 0,
        cleared_balance   NUMERIC(15,2),
        difference        NUMERIC(15,2),
        status            reconciliation_status NOT NULL DEFAULT 'IN_PROGRESS',
        reconciled_by     TEXT,
        reconciled_at     TIMESTAMP,
        created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_items (
        id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        reconciliation_id  TEXT NOT NULL,
        bank_transaction_id TEXT,
        transaction_id     TEXT,
        cleared            BOOLEAN NOT NULL DEFAULT FALSE,
        created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Schema check: reconciliations + reconciliation_items OK");
  } catch (err: any) {
    console.error("Schema migration error (reconciliation tables):", err.message);
  }

  // reconciliation_items.transaction_id — may be missing on DBs created before this column was added
  await ensureAlter(
    "reconciliation_items.transaction_id",
    `ALTER TABLE reconciliation_items ADD COLUMN IF NOT EXISTS transaction_id TEXT`,
  );

  // reconciliation_items.bank_transaction_id — older DBs created it NOT NULL; make it nullable
  await ensureAlter(
    "reconciliation_items.bank_transaction_id nullable",
    `ALTER TABLE reconciliation_items ALTER COLUMN bank_transaction_id DROP NOT NULL`,
  );

  // financial_snapshots
  try {
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'snapshot_type') THEN
          CREATE TYPE snapshot_type AS ENUM ('STATEMENT_OF_ACTIVITIES','BALANCE_SHEET','PERIOD_CLOSE','YEAR_END_CLOSE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'snapshot_status') THEN
          CREATE TYPE snapshot_status AS ENUM ('DRAFT','FINALIZED');
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS financial_snapshots (
        id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id                TEXT NOT NULL,
        snapshot_type             snapshot_type NOT NULL,
        period_label              TEXT NOT NULL,
        period_start              TIMESTAMP NOT NULL,
        period_end                TIMESTAMP NOT NULL,
        data                      TEXT NOT NULL,
        snapshot_status           snapshot_status NOT NULL DEFAULT 'FINALIZED',
        closing_journal_entry_id  TEXT,
        closed_by                 TEXT NOT NULL,
        closed_by_email           TEXT,
        created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log("Schema check: financial_snapshots OK");
  } catch (err: any) {
    console.error("Schema migration error (financial_snapshots):", err.message);
  }

  // reconciliations — statement file attachment columns
  await ensureAlter(
    "reconciliations.statement_file_name",
    `ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS statement_file_name TEXT`,
  );
  await ensureAlter(
    "reconciliations.statement_file_data",
    `ALTER TABLE reconciliations ADD COLUMN IF NOT EXISTS statement_file_data TEXT`,
  );

  // attachments — generic document attachments for record types
  // (BILL | EXPENSE | DONATION | TRANSACTION | JOURNAL_ENTRY).
  await ensureAlterThrow(
    "attachments table",
    `CREATE TABLE IF NOT EXISTS public.attachments (
       id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
       company_id        TEXT NOT NULL,
       entity_type       TEXT NOT NULL,
       entity_id         TEXT NOT NULL,
       file_name         TEXT NOT NULL,
       mime_type         TEXT NOT NULL DEFAULT 'application/octet-stream',
       file_size         INTEGER NOT NULL DEFAULT 0,
       file_data         TEXT NOT NULL,
       extracted_json    TEXT,
       uploaded_by       TEXT,
       uploaded_by_name  TEXT,
       created_at        TIMESTAMP NOT NULL DEFAULT NOW()
     )`,
  );
  await ensureAlterThrow(
    "attachments_company_entity_idx",
    `CREATE INDEX IF NOT EXISTS attachments_company_entity_idx
       ON public.attachments (company_id, entity_type, entity_id)`,
  );
  await ensureAlterThrow(
    "attachments.extracted_json",
    `ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS extracted_json TEXT`,
  );
}

async function main() {
  // CRITICAL: Do not call app.listen() until ensureSchema finishes. Otherwise the first
  // requests after deploy hit the API while columns are still missing → 500 + "nothing works".
  console.log("MissionLedger API — applying schema patches before accepting traffic…");
  await ensureSchema();
  await validateRequiredSchema();
  await seedPlatformAdmin();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  void initStripe();
}

main().catch((err) => {
  console.error("Fatal startup error (database schema or seed failed):", err);
  process.exit(1);
});
