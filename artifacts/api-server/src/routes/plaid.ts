import { Router } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { db, bankAccounts, transactions, companies } from "@workspace/db";
import { eq, and, inArray, count, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries, voidGlEntries } from "../lib/gl";
import { recomputeBankBalanceFromTransactions as recomputeBankBalance } from "../lib/bankBalance";
import { asDate } from "../lib/safeIso";

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

type PlaidAcct = {
  account_id: string;
  mask?: string | null;
  name?: string | null;
  official_name?: string | null;
  subtype?: string | null;
  type?: string | null;
  balances?: { current?: number | null; available?: number | null } | null;
};

/**
 * Map one MissionLedger bank row to a Plaid account on the same Item.
 * When masks match (e.g. same last 4), use name / account type vs Plaid subtype to disambiguate.
 */
function pickPlaidAccountForBank(
  plaidAccounts: PlaidAcct[],
  row: {
    plaidAccountId: string | null;
    lastFour: string | null;
    name: string;
    accountType: string;
  },
): PlaidAcct | null {
  if (row.plaidAccountId) {
    const found = plaidAccounts.find((a) => a.account_id === row.plaidAccountId);
    if (found) return found;
  }
  const mask = row.lastFour?.trim();
  if (mask) {
    const withMask = plaidAccounts.filter((a) => (a.mask || "") === mask);
    if (withMask.length === 1) return withMask[0];
    if (withMask.length > 1) {
      const name = (row.name || "").toLowerCase();
      const acctType = (row.accountType || "").toLowerCase();
      const wantsMM =
        acctType.includes("money") ||
        name.includes("money market") ||
        /\bmm\b/i.test(row.name) ||
        name.includes("mkt");
      const wantsChecking = acctType.includes("check") || name.includes("checking");
      const wantsSaving = acctType.includes("sav") || name.includes("saving");

      const bySubtype = (pred: (s: string) => boolean) =>
        withMask.find((a) => pred(String(a.subtype || "").toLowerCase()));

      let pick: PlaidAcct | undefined;
      if (wantsMM) {
        pick = bySubtype((s) => s === "money market" || s.includes("money"));
      }
      if (!pick && wantsChecking) pick = bySubtype((s) => s === "checking");
      if (!pick && wantsSaving) pick = bySubtype((s) => s.includes("sav"));

      if (pick) return pick;

      pick = withMask.find(
        (a) =>
          (a.name && name.length > 2 && a.name.toLowerCase().includes(name.slice(0, 8))) ||
          (a.official_name && name.length > 2 && a.official_name.toLowerCase().includes(name.slice(0, 8))),
      );
      if (pick) return pick;

      return null;
    }
  }
  if (plaidAccounts.length === 1) return plaidAccounts[0];
  return null;
}

async function getClosedUntil(companyId: string): Promise<Date | null> {
  const [co] = await db.select({ closedUntil: companies.closedUntil }).from(companies).where(eq(companies.id, companyId));
  return asDate(co?.closedUntil);
}

function isInClosedPeriod(txDate: unknown, closedUntil: unknown): boolean {
  const cu = asDate(closedUntil);
  if (!cu) return false;
  const d = asDate(txDate);
  if (!d) return false;
  return d <= cu;
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
    const { publicToken, bankAccountId, institutionName, plaidAccountId: bodyPlaidAccountId } = req.body;
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

    let resolvedPlaidAccountId: string | null = typeof bodyPlaidAccountId === "string" && bodyPlaidAccountId.trim()
      ? bodyPlaidAccountId.trim()
      : null;

    if (!resolvedPlaidAccountId) {
      try {
        const acctResp = await plaid.accountsGet({ access_token: accessToken });
        const list = (acctResp.data.accounts || []) as PlaidAcct[];
        const picked = pickPlaidAccountForBank(list, {
          plaidAccountId: account.plaidAccountId,
          lastFour: account.lastFour,
          name: account.name,
          accountType: account.accountType,
        });
        if (picked) resolvedPlaidAccountId = picked.account_id;
      } catch (e: any) {
        console.warn("Plaid accountsGet after exchange:", e?.message);
      }
    }

    await db.update(bankAccounts).set({
      plaidAccessToken: accessToken,
      plaidItemId: itemId,
      plaidInstitutionName: institutionName || null,
      isPlaidLinked: true,
      updatedAt: new Date(),
      ...(resolvedPlaidAccountId ? { plaidAccountId: resolvedPlaidAccountId } : {}),
    }).where(eq(bankAccounts.id, bankAccountId));

    res.json({ success: true, itemId, plaidAccountId: resolvedPlaidAccountId });
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

    const acctResp = await plaid.accountsGet({ access_token: account.plaidAccessToken });
    const plaidAccountList = (acctResp.data.accounts || []) as PlaidAcct[];

    const matchedPlaidAccount = pickPlaidAccountForBank(plaidAccountList, {
      plaidAccountId: account.plaidAccountId,
      lastFour: account.lastFour,
      name: account.name,
      accountType: account.accountType,
    });

    if (!matchedPlaidAccount) {
      return res.status(422).json({
        error:
          "Could not determine which Plaid account matches this MissionLedger bank. Set the correct last four digits on the bank account (Bank Accounts page), ensure the account name distinguishes checking vs money market, then sync again.",
        plaidAccountCount: plaidAccountList.length,
      });
    }

    const targetPlaidAccountId = matchedPlaidAccount.account_id;

    await db
      .update(bankAccounts)
      .set({ plaidAccountId: targetPlaidAccountId, updatedAt: new Date() })
      .where(eq(bankAccounts.id, bankAccountId));

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

    const plaidByTxnId = new Map<string, any>(allPlaidTx.map((t) => [t.transaction_id, t]));

    // ── Void register rows that belong to a different Plaid sub-account on the same Item ──
    let voidedMisattributed = 0;
    const closedUntil = await getClosedUntil(companyId);
    const localPlaidRows = await db
      .select({
        id: transactions.id,
        plaidTransactionId: transactions.plaidTransactionId,
        plaidSourceAccountId: transactions.plaidSourceAccountId,
        date: transactions.date,
        transferPairTransactionId: transactions.transferPairTransactionId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.bankAccountId, bankAccountId),
          eq(transactions.companyId, companyId),
          isNotNull(transactions.plaidTransactionId),
          eq(transactions.isVoid, false)
        )
      );

    const idsToVoid: string[] = [];
    for (const row of localPlaidRows) {
      const pid = row.plaidTransactionId!;
      if (row.plaidSourceAccountId && row.plaidSourceAccountId !== targetPlaidAccountId) {
        if (!isInClosedPeriod(row.date, closedUntil)) idsToVoid.push(row.id);
        continue;
      }
      const ptx = plaidByTxnId.get(pid);
      if (ptx && ptx.account_id && ptx.account_id !== targetPlaidAccountId) {
        if (!isInClosedPeriod(row.date, closedUntil)) idsToVoid.push(row.id);
      }
    }

    for (const id of idsToVoid) {
      const [row] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.companyId, companyId)));
      if (!row || row.isVoid) continue;
      if (row.transferPairTransactionId) {
        console.warn(`[Plaid cleanup] Skip void Plaid tx ${id} — has transfer pair; fix manually if needed.`);
        continue;
      }
      await db
        .update(transactions)
        .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
        .where(eq(transactions.id, id));
      await voidGlEntries(id, companyId);
      voidedMisattributed++;
    }
    if (voidedMisattributed > 0) {
      await recomputeBankBalance(bankAccountId, companyId);
    }

    // Only import transactions for this Plaid sub-account
    const forThisAccount = allPlaidTx.filter((t) => t.account_id === targetPlaidAccountId);

    const plaidIds = forThisAccount.map((t) => t.transaction_id);
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
    const newTx = forThisAccount.filter((t) => !existingIds.has(t.transaction_id));

    if (newTx.length > 0) {
      const inserted = await db.insert(transactions).values(
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
          plaidSourceAccountId: t.account_id ?? targetPlaidAccountId,
        } as any))
      ).returning({ id: transactions.id });

      for (const row of inserted) {
        await generateGlEntries(row.id, companyId).catch((err) =>
          console.error("GL generation failed for Plaid tx", row.id, err)
        );
      }
    }

    let updatedBalance: number | undefined;
    try {
      const balanceResponse = await plaid.accountsBalanceGet({ access_token: account.plaidAccessToken });
      const plaidAccountsBal = balanceResponse.data.accounts as PlaidAcct[];
      const matchedForBalance = pickPlaidAccountForBank(plaidAccountsBal, {
        plaidAccountId: targetPlaidAccountId,
        lastFour: account.lastFour,
        name: account.name,
        accountType: account.accountType,
      }) || plaidAccountsBal.find((a) => a.account_id === targetPlaidAccountId);
      if (matchedForBalance?.balances?.current != null) {
        updatedBalance = matchedForBalance.balances.current as number;
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
      totalFetched: allPlaidTx.length,
      totalForThisAccount: forThisAccount.length,
      voidedMisattributed,
      plaidAccountId: targetPlaidAccountId,
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
      plaidAccountId: null,
      isPlaidLinked: false,
      plaidLastSyncedAt: null,
      updatedAt: new Date(),
    }).where(
      and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId))
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error("Plaid unlink error:", err.message);
    res.status(500).json({ error: "Failed to unlink bank account" });
  }
});

export default router;
