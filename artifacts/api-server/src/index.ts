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
    yearlyAmount: 19000,
  },
  {
    name: "Professional",
    description: "Full-featured accounting for growing nonprofits.",
    metadata: { features: "5 bank accounts|Unlimited transactions|Advanced reports & analytics|Priority support|Plaid bank sync|Multi-user access|Period close wizard", order: "2", featured: "true" },
    monthlyAmount: 4900,
    yearlyAmount: 49000,
  },
  {
    name: "Enterprise",
    description: "Unlimited scale for large organizations and networks.",
    metadata: { features: "Unlimited bank accounts|Unlimited transactions|Custom reports|Dedicated support|Plaid bank sync|Unlimited users|Multi-org management|API access", order: "3" },
    monthlyAmount: 9900,
    yearlyAmount: 99000,
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
          metadata: plan.metadata,
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
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_comped BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS comped_note TEXT`);
    console.log("Schema check: companies.is_comped OK");
  } catch (err: any) {
    console.error("Schema migration error (is_comped):", err.message);
  }
  try {
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS donor_name TEXT`);
    console.log("Schema check: transactions.donor_name OK");
  } catch (err: any) {
    console.error("Schema migration error (donor_name):", err.message);
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
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await ensureSchema();
  await seedPlatformAdmin();
  await initStripe();
});
