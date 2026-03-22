import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";

let connectionSettings: any;

async function fetchConnectorKey(hostname: string, token: string, environment: string) {
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", environment);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": token },
  });
  const data = await response.json();
  const settings = data.items?.[0];
  if (settings?.settings?.secret) {
    return { publishableKey: settings.settings.publishable || "", secretKey: settings.settings.secret };
  }
  return null;
}

// Returns true when the app is using its own API keys (sk_/rk_ prefixes)
// rather than Replit-managed mk_ keys through the connector proxy.
export function isUsingOwnStripeKey(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return (
    !key.startsWith("mk_") &&
    (key.startsWith("sk_test_") || key.startsWith("sk_live_") ||
     key.startsWith("rk_test_") || key.startsWith("rk_live_"))
  );
}

async function getCredentials() {
  // If explicit API keys are provided, always use them — they take priority over
  // the Replit connector (which defaults to test/managed keys).
  // NOTE: Skip mk_ keys — those are Replit-managed proxy keys that cannot be used
  // directly against the Stripe API; they must go through the connector path below.
  const envSecret = process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY || "";
  console.log(`[Stripe] STRIPE_SECRET_KEY prefix: "${envSecret ? envSecret.slice(0, 12) : "(not set)"}"`);
  if (envSecret && !envSecret.startsWith("mk_")) {
    const mode = envSecret.startsWith("sk_live_") || envSecret.startsWith("rk_live_") ? "live" : "test";
    console.log(`[Stripe] Using STRIPE_SECRET_KEY (${mode} mode)`);
    connectionSettings = { publishableKey: envPublishable, secretKey: envSecret };
    return { publishableKey: envPublishable, secretKey: envSecret };
  }

  // Fall back to the Replit connector (managed/mk_ keys or connector-linked account)
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (hostname && xReplitToken) {
    try {
      const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
      const environments = isProduction ? ["production", "development"] : ["development"];
      for (const env of environments) {
        const creds = await fetchConnectorKey(hostname, xReplitToken, env);
        if (creds) {
          if (isProduction && env === "development") {
            console.log("[Stripe] Using development connector key in production (no production key configured)");
          }
          connectionSettings = creds;
          return creds;
        }
      }
      console.warn("[Stripe] Connector returned no key for any environment");
    } catch (err) {
      console.warn("[Stripe] Connector lookup failed:", err);
    }
  }

  throw new Error("Stripe not configured: set STRIPE_SECRET_KEY or connect via Replit Stripe integration");
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
