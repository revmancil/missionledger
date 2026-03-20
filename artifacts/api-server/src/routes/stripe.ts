import { Router } from "express";
import { db, companies } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { sendSubscriptionConfirmedEmail } from "../lib/email";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { stripeStorage } from "../lib/stripeStorage";

const router = Router();

function getBaseUrl(req: any): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

router.get("/plans", async (_req, res) => {
  try {
    const rows = await stripeStorage.listProductsWithPrices();
    const productsMap = new Map<string, any>();
    for (const row of rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata || {},
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }

    // If the sync DB is empty, fall back to fetching directly from Stripe API
    if (productsMap.size === 0) {
      const stripe = await getUncachableStripeClient();
      const [products, prices] = await Promise.all([
        stripe.products.list({ active: true, limit: 100 }),
        stripe.prices.list({ active: true, limit: 100 }),
      ]);
      const pricesByProduct = new Map<string, any[]>();
      for (const price of prices.data) {
        const pid = typeof price.product === "string" ? price.product : price.product.id;
        if (!pricesByProduct.has(pid)) pricesByProduct.set(pid, []);
        pricesByProduct.get(pid)!.push({
          id: price.id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
        });
      }
      const fallbackPlans = products.data.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        metadata: p.metadata || {},
        prices: pricesByProduct.get(p.id) || [],
      }));
      return res.json({ data: fallbackPlans });
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (err: any) {
    console.error("Error fetching plans:", err.message);
    res.status(503).json({ error: "Billing not configured", data: [] });
  }
});

router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "Company not found" });

    let subscription = null;
    if (company.stripeSubscriptionId) {
      subscription = await stripeStorage.getSubscription(company.stripeSubscriptionId);
    }

    const trialExpiry = new Date(company.createdAt);
    trialExpiry.setDate(trialExpiry.getDate() + 14);
    const msRemaining = trialExpiry.getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

    res.json({
      subscriptionStatus: company.subscriptionStatus,
      stripeSubscriptionId: company.stripeSubscriptionId,
      stripeCustomerId: company.stripeCustomerId,
      trialExpiresAt: trialExpiry.toISOString(),
      daysRemaining,
      isTrialExpired: company.subscriptionStatus === "TRIAL" && msRemaining <= 0,
      subscription,
    });
  } catch (err: any) {
    console.error("Error fetching subscription:", err.message);
    res.status(500).json({ error: "Failed to load subscription" });
  }
});

router.post("/checkout", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: "priceId is required" });

    const stripe = await getUncachableStripeClient();

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "Company not found" });

    let customerId = company.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.email || undefined,
        name: company.name,
        metadata: { companyId, companyCode: company.companyCode },
      });
      customerId = customer.id;
      await db.update(companies).set({ stripeCustomerId: customerId }).where(eq(companies.id, companyId));
    }

    const base = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${base}/billing?success=1`,
      cancel_url: `${base}/billing?cancelled=1`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/portal", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (!company.stripeCustomerId) return res.status(400).json({ error: "No Stripe customer. Subscribe first." });

    const stripe = await getUncachableStripeClient();
    const base = getBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${base}/billing`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Portal error:", err.message);
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

router.post("/notify-subscribed", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [company] = await db.select({ name: companies.name, email: companies.email, subscriptionStatus: companies.subscriptionStatus }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (company.subscriptionStatus !== "ACTIVE") return res.json({ ok: true, skipped: true });

    const adminEmail = (req as any).user.email;
    if (adminEmail) {
      await sendSubscriptionConfirmedEmail(adminEmail, company.name);
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Notify subscribed error:", err.message);
    res.status(500).json({ error: "Failed to send confirmation email" });
  }
});

export default router;
