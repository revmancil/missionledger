import app from "./app";
import { seedPlatformAdmin } from "./seeds/platform-admin";
import { runMigrations, getStripeSync } from "./lib/stripeClient";

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
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.log("Stripe not configured — skipping Stripe initialization (STRIPE_SECRET_KEY not set)");
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

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await seedPlatformAdmin();
  await initStripe();
});
