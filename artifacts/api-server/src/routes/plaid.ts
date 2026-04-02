import { Router } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { db, bankAccounts, transactions } from "@workspace/db";
import { eq, and, inArray, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

/** Plaid API host: explicit PLAID_ENV wins; else production Node builds use Plaid production; otherwise sandbox (local dev). */
function resolvePlaidEnv(): "production" | "development" | "sandbox" {
  const raw = process.env.PLAID_ENV?.trim().toLowerCase();
  if (raw === "production" || raw === "development" || raw === "sandbox") return raw;
  if (process.env.NODE_ENV === "production") return "production";
  return "sandbox";
}

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET environment variables are required.");
  }
  const env = resolvePlaidEnv();
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
    const plaidError = err?.response?.data;
    console.error("Plaid link token error:", {
      message: err.message,
      plaidErrorCode: plaidError?.error_code,
      plaidErrorType: plaidError?.error_type,
      plaidErrorMessage: plaidError?.error_message,
      plaidDisplayMessage: plaidError?.display_message,
      plaidEnv: resolvePlaidEnv(),
      plaidEnvRaw: process.env.PLAID_ENV,
      hasClientId: !!process.env.PLAID_CLIENT_ID,
      hasSecret: !!process.env.PLAID_SECRET,
    });
    const userMessage = plaidError?.display_message
      || plaidError?.error_message
      || err.message
      || "Plaid not configured";
    res.status(503).json({ error: userMessage, plaidCode: plaidError?.error_code });
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

    // If no transactions exist for this account yet, always do a full 90-day sync
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.bankAccountId, bankAccountId),
          eq(transactions.companyId, companyId)
        )
      );

    const forceFullSync = Number(existingCount) === 0;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const startDate = (!forceFullSync && account.plaidLastSyncedAt)
      ? account.plaidLastSyncedAt.toISOString().slice(0, 10)
      : ninetyDaysAgo;
    const endDate = new Date().toISOString().slice(0, 10);

    // Fetch all pages from Plaid
    let allPlaidTx: any[] = [];
    let offset = 0;
    while (true) {
      const txResponse = await plaid.transactionsGet({
        access_token: account.plaidAccessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset },
      });
      const batch = txResponse.data.transactions;
      allPlaidTx = allPlaidTx.concat(batch);
      if (allPlaidTx.length >= txResponse.data.total_transactions) break;
      offset += batch.length;
    }

    // Deduplicate: check plaid_transaction_id in the transactions table
    const plaidIds = allPlaidTx.map((t) => t.transaction_id);
    const existing = plaidIds.length > 0
      ? await db
          .select({ plaidTransactionId: (transactions as any).plaidTransactionId })
          .from(transactions)
          .where(
            and(
              eq(transactions.companyId, companyId),
              eq(transactions.bankAccountId, bankAccountId),
              inArray((transactions as any).plaidTransactionId, plaidIds)
            )
          )
      : [];
    const existingIds = new Set(existing.map((e: any) => e.plaidTransactionId));
    const newTx = allPlaidTx.filter((t) => !existingIds.has(t.transaction_id));

    // Insert into the transactions table (what the Bank Register reads)
    // Plaid: positive amount = debit (money out), negative = credit (money in)
    if (newTx.length > 0) {
      await db.insert(transactions).values(
        newTx.map((t) => ({
          companyId,
          bankAccountId,
          date: new Date(t.date),
          payee: t.merchant_name || t.name || "Plaid Import",
          amount: Math.abs(t.amount),
          type: t.amount >= 0 ? "DEBIT" : "CREDIT",
          status: t.pending ? "UNCLEARED" : "UNCLEARED",
          memo: t.name !== t.merchant_name ? t.name : null,
          plaidTransactionId: t.transaction_id,
        } as any))
      );
    }

    // Fetch current balance from Plaid and update the bank account
    let updatedBalance: number | undefined;
    try {
      const balanceResponse = await plaid.accountsBalanceGet({ access_token: account.plaidAccessToken });
      const plaidAccounts = balanceResponse.data.accounts;
      // Match by last four digits if available, otherwise take the first account
      const matchedAccount = account.lastFour
        ? plaidAccounts.find((a) => a.mask === account.lastFour) || plaidAccounts[0]
        : plaidAccounts[0];
      if (matchedAccount?.balances?.current != null) {
        updatedBalance = matchedAccount.balances.current;
      }
    } catch (balErr: any) {
      console.warn("Could not fetch Plaid balance:", balErr.message);
    }

    await db.update(bankAccounts).set({
      plaidLastSyncedAt: new Date(),
      updatedAt: new Date(),
      ...(updatedBalance !== undefined ? { currentBalance: updatedBalance } : {}),
    }).where(eq(bankAccounts.id, bankAccountId));

    res.json({
      imported: newTx.length,
      skipped: existingIds.size,
      total: allPlaidTx.length,
      startDate,
      endDate,
      balance: updatedBalance,
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
