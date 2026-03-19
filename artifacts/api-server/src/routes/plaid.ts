import { Router } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { db, bankAccounts } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET environment variables are required.");
  }
  const env = process.env.PLAID_ENV || "sandbox";
  const baseUrl = env === "production"
    ? PlaidEnvironments.production
    : env === "development"
    ? PlaidEnvironments.development
    : PlaidEnvironments.sandbox;

  const config = new Configuration({
    basePath: baseUrl,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(config);
}

router.post("/create-link-token", requireAuth, async (req, res) => {
  try {
    const { id: userId, companyId } = (req as any).user;
    const plaid = getPlaidClient();
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: `${companyId}:${userId}` },
      client_name: "MissionLedger",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err: any) {
    console.error("Plaid link token error:", err.message);
    res.status(503).json({ error: "Plaid not configured. Please add PLAID_CLIENT_ID and PLAID_SECRET." });
  }
});

router.post("/exchange-token", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { publicToken, bankAccountId, institutionName } = req.body;
    if (!publicToken || !bankAccountId) {
      return res.status(400).json({ error: "publicToken and bankAccountId are required" });
    }

    const [account] = await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId))
    );
    if (!account) return res.status(404).json({ error: "Bank account not found" });

    const plaid = getPlaidClient();
    const exchangeResponse = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    await db.update(bankAccounts).set({
      plaidAccessToken: accessToken,
      plaidItemId: itemId,
      plaidInstitutionName: institutionName || null,
      isPlaidLinked: true,
      updatedAt: new Date(),
    }).where(eq(bankAccounts.id, bankAccountId));

    res.json({ success: true, itemId });
  } catch (err: any) {
    console.error("Plaid token exchange error:", err.message);
    res.status(500).json({ error: "Failed to link bank account" });
  }
});

router.post("/sync/:bankAccountId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId } = req.params;

    const [account] = await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId))
    );
    if (!account) return res.status(404).json({ error: "Bank account not found" });
    if (!account.plaidAccessToken) return res.status(400).json({ error: "Bank account not linked with Plaid" });

    const plaid = getPlaidClient();

    const startDate = account.plaidLastSyncedAt
      ? account.plaidLastSyncedAt.toISOString().slice(0, 10)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const txResponse = await plaid.transactionsGet({
      access_token: account.plaidAccessToken,
      start_date: startDate,
      end_date: endDate,
    });

    const transactions = txResponse.data.transactions;

    await db.update(bankAccounts).set({
      plaidLastSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(bankAccounts.id, bankAccountId));

    res.json({
      imported: transactions.length,
      startDate,
      endDate,
      transactions: transactions.map((t) => ({
        plaidTransactionId: t.transaction_id,
        date: t.date,
        description: t.name,
        amount: t.amount,
        category: t.category,
        merchantName: t.merchant_name,
      })),
    });
  } catch (err: any) {
    console.error("Plaid sync error:", err.message);
    res.status(500).json({ error: "Failed to sync transactions" });
  }
});

router.delete("/unlink/:bankAccountId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId } = req.params;

    await db.update(bankAccounts).set({
      plaidAccessToken: null,
      plaidItemId: null,
      plaidInstitutionName: null,
      isPlaidLinked: false,
      plaidLastSyncedAt: null,
      updatedAt: new Date(),
    }).where(
      and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId))
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("Plaid unlink error:", err.message);
    res.status(500).json({ error: "Failed to unlink account" });
  }
});

export default router;
