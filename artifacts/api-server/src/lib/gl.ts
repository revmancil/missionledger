/**
 * GL (General Ledger) Engine
 *
 * Generates balanced double-entry gl_entries for every transaction.
 * Called from the transactions route on every create / update / void.
 *
 * Rules:
 *  - Every transaction produces at minimum two entries (bank side + category side).
 *  - For split transactions, each split line gets its own entry; the bank gets one
 *    net entry equal to transaction.amount.
 *  - sum(debits) MUST equal sum(credits) for each transactionId.
 *  - Voided transactions: existing GL entries are soft-voided (isVoid = true).
 *  - Fund linkage: fundId and fundName are denormalised onto every GL entry.
 *  - functionalType: propagated from transaction/split onto the category-side
 *    GL entry only when the account is an EXPENSE account.
 */

import {
  db,
  transactions,
  transactionSplits,
  chartOfAccounts,
  bankAccounts,
  glEntries,
  funds,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number; // always positive
  description: string | null;
  fundId: string | null;
  fundName: string | null;
  functionalType?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given the transaction type (CREDIT = income/deposit, DEBIT = expense/payment)
 * and a COA account type, determine the normal debit/credit direction for the
 * CATEGORY side of a simple (non-split) transaction.
 *
 *  CREDIT (income)  → INCOME accounts are CREDITED, bank is DEBITED
 *  DEBIT  (expense) → EXPENSE accounts are DEBITED, bank is CREDITED
 */
function categoryEntryType(
  txType: "CREDIT" | "DEBIT",
  coaType: string
): "DEBIT" | "CREDIT" {
  if (txType === "CREDIT") {
    return coaType === "EXPENSE" ? "DEBIT" : "CREDIT";
  } else {
    return coaType === "INCOME" ? "CREDIT" : "DEBIT";
  }
}

/**
 * Determine the GL entry type for a SPLIT line.
 */
function splitEntryType(
  txType: "CREDIT" | "DEBIT",
  coaType: string,
  amount: number
): "DEBIT" | "CREDIT" {
  const positive = amount >= 0;
  let normal: "DEBIT" | "CREDIT";

  switch (coaType) {
    case "INCOME":
      normal = "CREDIT";
      break;
    case "EXPENSE":
      normal = "DEBIT";
      break;
    case "ASSET":
      normal = txType === "CREDIT" ? "DEBIT" : "CREDIT";
      break;
    default: // LIABILITY, EQUITY
      normal = txType === "CREDIT" ? "CREDIT" : "DEBIT";
  }

  return positive ? normal : normal === "DEBIT" ? "CREDIT" : "DEBIT";
}

// ── Core GL generation ────────────────────────────────────────────────────────

export async function generateGlEntries(
  txId: string,
  companyId: string
): Promise<void> {
  // 1. Remove any prior GL entries for this transaction
  await db
    .delete(glEntries)
    .where(
      and(eq(glEntries.transactionId, txId), eq(glEntries.companyId, companyId))
    );

  // 2. Load transaction
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, txId), eq(transactions.companyId, companyId)));

  if (!tx) return;

  // 3. Voided transactions get no GL entries
  if (tx.isVoid) return;

  // 3b. Lines tied to a posted journal entry (e.g. Opening Balance register rows): GL lives on the JE only.
  // Generating TRANSACTION GL here would duplicate or distort the ledger (e.g. trial-balance /sync).
  if (tx.journalEntryId) return;

  // 3c. Mirror leg of an inter-bank transfer — GL is posted on the paired transaction only.
  if (tx.excludeFromGl) return;

  // 4. Resolve fund name (denormalised onto entries)
  let txFundName: string | null = null;
  if (tx.fundId) {
    const [fund] = await db.select({ name: funds.name }).from(funds).where(eq(funds.id, tx.fundId));
    txFundName = fund?.name ?? null;
  }

  // 5. Load COA lookup
  const allCoa = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId));

  const coaById = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const coaByCode = Object.fromEntries(allCoa.map((a) => [a.code, a]));

  // 6. Resolve bank account's COA entry
  let bankCoa: (typeof allCoa)[0] | null = null;
  let bankHadGlLink = false;

  if (tx.bankAccountId) {
    const [bank] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, tx.bankAccountId));

    if (bank?.glAccountId) {
      bankHadGlLink = true;
      bankCoa = coaById[bank.glAccountId] ?? null;
      if (!bankCoa) {
        console.error(
          `[GL] bank_accounts.gl_account_id ${bank.glAccountId} not found in chart_of_accounts — tx=${txId}. Fix the bank→GL link.`
        );
        return;
      }
    }
  }

  // Fallback only when the bank record has no GL link (legacy / uncategorized registers)
  if (!bankCoa && !bankHadGlLink) {
    bankCoa =
      coaByCode["1010"] ??
      coaByCode["1000"] ??
      allCoa.find((a) => a.type === "ASSET") ??
      null;
  }

  const rawEntries: RawEntry[] = [];

  // ── Simple transaction ────────────────────────────────────────────────────
  if (!tx.isSplit) {
    const catCoa = tx.chartAccountId ? coaById[tx.chartAccountId] ?? null : null;
    if (tx.chartAccountId && !catCoa) {
      console.error(
        `[GL] transactions.chart_account_id ${tx.chartAccountId} not found in chart_of_accounts — tx=${txId}`
      );
      return;
    }

    // Bank side (no functional type)
    if (bankCoa) {
      const bankEntryType = tx.type === "CREDIT" ? "DEBIT" : "CREDIT";
      rawEntries.push({
        accountId: bankCoa.id,
        accountCode: bankCoa.code,
        accountName: bankCoa.name,
        accountType: bankCoa.type,
        entryType: bankEntryType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
        fundId: tx.fundId ?? null,
        fundName: txFundName,
        functionalType: null,
      });
    }

    // Category side: propagate functionalType only for EXPENSE accounts
    if (catCoa) {
      const catType = categoryEntryType(tx.type, catCoa.type);
      rawEntries.push({
        accountId: catCoa.id,
        accountCode: catCoa.code,
        accountName: catCoa.name,
        accountType: catCoa.type,
        entryType: catType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
        fundId: tx.fundId ?? null,
        fundName: txFundName,
        functionalType: catCoa.type === "EXPENSE" ? (tx.functionalType ?? null) : null,
      });
    }
  } else {
    // ── Split transaction ───────────────────────────────────────────────────
    const splits = await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txId))
      .orderBy(transactionSplits.sortOrder);

    // Cash line: use header fund, or when every categorized split shares one fund, tag cash with that fund too.
    let bankFundId: string | null = tx.fundId ?? null;
    let bankFundName: string | null = txFundName;
    const splitLineFunds = splits
      .filter((sp) => sp.chartAccountId)
      .map((sp) => (sp as { fundId?: string | null }).fundId ?? tx.fundId ?? null)
      .filter((id): id is string => id != null && String(id).length > 0);
    const uniqueSplitFunds = [...new Set(splitLineFunds)];
    if (uniqueSplitFunds.length === 1) {
      bankFundId = uniqueSplitFunds[0];
      if (bankFundId !== tx.fundId) {
        const [bf] = await db.select({ name: funds.name }).from(funds).where(eq(funds.id, bankFundId));
        bankFundName = bf?.name ?? null;
      } else {
        bankFundName = txFundName;
      }
    }

    // Bank gets the NET amount (transaction.amount)
    if (bankCoa) {
      const bankEntryType = tx.type === "CREDIT" ? "DEBIT" : "CREDIT";
      rawEntries.push({
        accountId: bankCoa.id,
        accountCode: bankCoa.code,
        accountName: bankCoa.name,
        accountType: bankCoa.type,
        entryType: bankEntryType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
        fundId: bankFundId,
        fundName: bankFundName,
        functionalType: null,
      });
    }

    // Each split line gets its own entry
    for (const split of splits) {
      if (!split.chartAccountId) continue;
      const splitCoa = coaById[split.chartAccountId];
      if (!splitCoa) continue;

      // Resolve per-split fund (falls back to transaction fund)
      const splitFundId = (split as any).fundId ?? tx.fundId ?? null;
      let splitFundName = txFundName;
      if (splitFundId && splitFundId !== tx.fundId) {
        const [sf] = await db.select({ name: funds.name }).from(funds).where(eq(funds.id, splitFundId));
        splitFundName = sf?.name ?? null;
      }

      const et = splitEntryType(tx.type, splitCoa.type, split.amount);
      rawEntries.push({
        accountId: splitCoa.id,
        accountCode: splitCoa.code,
        accountName: splitCoa.name,
        accountType: splitCoa.type,
        entryType: et,
        amount: Math.abs(split.amount),
        description: split.memo ?? tx.payee,
        fundId: splitFundId,
        fundName: splitFundName,
        functionalType: splitCoa.type === "EXPENSE" ? (split.functionalType ?? null) : null,
      });
    }
  }

  // ── Balance check — STRICT: only persist if fully balanced ───────────────
  const totalDebits  = rawEntries.filter((e) => e.entryType === "DEBIT" ).reduce((s, e) => s + e.amount, 0);
  const totalCredits = rawEntries.filter((e) => e.entryType === "CREDIT").reduce((s, e) => s + e.amount, 0);

  if (rawEntries.length === 0) return;

  if (Math.abs(totalDebits - totalCredits) > 0.005) {
    console.warn(
      `[GL] Skipping tx=${txId} — out of balance: debits=${totalDebits.toFixed(2)} credits=${totalCredits.toFixed(2)}`
    );
    await db.delete(glEntries).where(
      and(eq(glEntries.transactionId, txId), eq(glEntries.companyId, companyId))
    );
    return;
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  for (const e of rawEntries) {
    await db.insert(glEntries).values({
      companyId,
      transactionId: txId,
      sourceType: "TRANSACTION",
      accountId: e.accountId,
      accountCode: e.accountCode,
      accountName: e.accountName,
      fundId: e.fundId,
      fundName: e.fundName,
      entryType: e.entryType,
      amount: e.amount,
      description: e.description,
      date: tx.date,
      isVoid: false,
      functionalType: (e.functionalType as any) ?? null,
    });
  }
}

/**
 * Soft-void all GL entries for a given transaction.
 */
export async function voidGlEntries(txId: string, companyId: string): Promise<void> {
  await db
    .update(glEntries)
    .set({ isVoid: true, updatedAt: new Date() })
    .where(
      and(eq(glEntries.transactionId, txId), eq(glEntries.companyId, companyId))
    );
}
