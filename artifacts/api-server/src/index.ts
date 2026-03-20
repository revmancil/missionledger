import app from "./app";
import { seedPlatformAdmin } from "./seeds/platform-admin";
import { runMigrations, getStripeSync } from "./lib/stripeClient";
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
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      console.log("Setting up managed webhook at", webhookUrl);
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      console.log("Stripe webhook configured");
    }

    stripeSync.syncBackfill()
      .then(() => console.log("Stripe data synced"))
      .catch((err: any) => console.error("Stripe sync error:", err.message));
  } catch (err: any) {
    console.error("Stripe initialization failed:", err.message);
  }
}

async function ensureSchema() {
  try {
    await pool.query(`
      ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
    `);
    console.log("Schema check: plaid_transaction_id columns OK");
  } catch (err: any) {
    console.error("Schema migration error (plaid cols):", err.message);
  }
  try {
    await pool.query(`ALTER TYPE gl_source_type ADD VALUE IF NOT EXISTS 'MANUAL_JE'`);
    console.log("Schema check: gl_source_type MANUAL_JE OK");
  } catch (err: any) {
    console.error("Schema migration error (gl_source_type):", err.message);
  }
  try {
    await pool.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference_number TEXT`);
    console.log("Schema check: journal_entries.reference_number OK");
  } catch (err: any) {
    console.error("Schema migration error (reference_number):", err.message);
  }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log("Schema check: companies.maintenance_mode OK");
  } catch (err: any) {
    console.error("Schema migration error (maintenance_mode):", err.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO system_settings (key, value) VALUES ('global_maintenance_mode', 'false')
        ON CONFLICT (key) DO NOTHING;
    `);
    console.log("Schema check: system_settings OK");
  } catch (err: any) {
    console.error("Schema migration error (system_settings):", err.message);
  }
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
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await ensureSchema();
  await seedPlatformAdmin();
  await initStripe();
});
