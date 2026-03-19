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

async function initStripe() {
  const hasConnector = !!process.env.REPLIT_CONNECTORS_HOSTNAME;
  const hasFallbackKey = !!process.env.STRIPE_SECRET_KEY;
  if (!hasConnector && !hasFallbackKey) {
    console.log("Stripe not configured — skipping initialization (no connector or STRIPE_SECRET_KEY)");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL!;
  try {
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
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await ensureSchema();
  await seedPlatformAdmin();
  await initStripe();
});
