import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set. Connect the Stripe integration first.");
  }
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set. Connect the Stripe integration first.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new StripeSync({
    stripeSecretKey: secretKey,
    databaseUrl,
  });
}

export { runMigrations };
