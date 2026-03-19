import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  // Try the Replit connector first (preferred path)
  if (hostname && xReplitToken) {
    try {
      const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
      const targetEnvironment = isProduction ? "production" : "development";

      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set("include_secrets", "true");
      url.searchParams.set("connector_names", "stripe");
      url.searchParams.set("environment", targetEnvironment);

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      });

      const data = await response.json();
      connectionSettings = data.items?.[0];

      if (connectionSettings?.settings?.secret) {
        return {
          publishableKey: connectionSettings.settings.publishable || "",
          secretKey: connectionSettings.settings.secret,
        };
      }

      console.warn(`[Stripe] Connector has no ${targetEnvironment} key — falling back to STRIPE_SECRET_KEY`);
    } catch (err) {
      console.warn("[Stripe] Connector lookup failed — falling back to STRIPE_SECRET_KEY:", err);
    }
  }

  // Fallback: manually configured secret key
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable = process.env.STRIPE_PUBLISHABLE_KEY || "";
  if (!secret) {
    throw new Error("Stripe not configured: no Replit connector key or STRIPE_SECRET_KEY env var");
  }
  return { publishableKey: publishable, secretKey: secret };
}

// WARNING: Never cache this client — tokens expire.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: "2025-01-27.acacia" as any,
  });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSyncInstance: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSyncInstance) {
    const secretKey = await getStripeSecretKey();
    stripeSyncInstance = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
      ...(process.env.STRIPE_WEBHOOK_SECRET
        ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET }
        : {}),
    });
  }
  return stripeSyncInstance;
}

export { runMigrations };
