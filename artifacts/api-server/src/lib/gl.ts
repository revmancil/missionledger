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
 */

import {
  db,
  transactions,
  transactionSplits,
  chartOfAccounts,
  bankAccounts,
  glEntries,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number; // always positive
  description: string | null;
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
    // Income/deposit — revenue accounts get CREDIT; expense accounts get DEBIT
    return coaType === "EXPENSE" ? "DEBIT" : "CREDIT";
  } else {
    // Expense/payment — expense accounts get DEBIT; income accounts get CREDIT
    return coaType === "INCOME" ? "CREDIT" : "DEBIT";
  }
}

/**
 * Determine the GL entry type for a SPLIT line.
 *
 * Sign convention for split amounts:
 *  Positive  → normal direction for the account type
 *  Negative  → reversal (e.g. a fee offset against an income split)
 *
 * Normal directions:
 *  INCOME   → CREDIT (revenue increases)
 *  EXPENSE  → DEBIT  (cost increases)
 *  ASSET    → follows transaction type
 *  LIABILITY/EQUITY → follows opposite of transaction type
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

  // 3. Voided transactions get no GL entries (they were deleted in step 1)
  if (tx.isVoid) return;

  // 4. Load COA lookup
  const allCoa = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId));

  const coaById = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const coaByCode = Object.fromEntries(allCoa.map((a) => [a.code, a]));

  // 5. Resolve bank account's COA entry
  let bankCoa: (typeof allCoa)[0] | null = null;

  if (tx.bankAccountId) {
    const [bank] = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, tx.bankAccountId));

    if (bank?.glAccountId) {
      bankCoa = coaById[bank.glAccountId] ?? null;
    }
  }

  // Fallback: 1010 → 1000 → first ASSET
  if (!bankCoa) {
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

    // Bank side
    if (bankCoa) {
      const bankEntryType = tx.type === "CREDIT" ? "DEBIT" : "CREDIT";
      rawEntries.push({
        accountId: bankCoa.id,
        accountCode: bankCoa.code,
        accountName: bankCoa.name,
        entryType: bankEntryType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
      });
    }

    // Category side
    if (catCoa) {
      const catType = categoryEntryType(tx.type, catCoa.type);
      rawEntries.push({
        accountId: catCoa.id,
        accountCode: catCoa.code,
        accountName: catCoa.name,
        entryType: catType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
      });
    }
  } else {
    // ── Split transaction ───────────────────────────────────────────────────
    const splits = await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, txId))
      .orderBy(transactionSplits.sortOrder);

    // Bank gets the NET amount (transaction.amount)
    if (bankCoa) {
      const bankEntryType = tx.type === "CREDIT" ? "DEBIT" : "CREDIT";
      rawEntries.push({
        accountId: bankCoa.id,
        accountCode: bankCoa.code,
        accountName: bankCoa.name,
        entryType: bankEntryType,
        amount: Math.abs(tx.amount),
        description: tx.payee,
      });
    }

    // Each split line gets its own entry
    for (const split of splits) {
      if (!split.chartAccountId) continue;
      const splitCoa = coaById[split.chartAccountId];
      if (!splitCoa) continue;

      const et = splitEntryType(tx.type, splitCoa.type, split.amount);
      rawEntries.push({
        accountId: splitCoa.id,
        accountCode: splitCoa.code,
        accountName: splitCoa.name,
        entryType: et,
        amount: Math.abs(split.amount),
        description: split.memo ?? tx.payee,
      });
    }
  }

  // ── Balance check — STRICT: only persist if fully balanced ───────────────
  const totalDebits  = rawEntries.filter((e) => e.entryType === "DEBIT" ).reduce((s, e) => s + e.amount, 0);
  const totalCredits = rawEntries.filter((e) => e.entryType === "CREDIT").reduce((s, e) => s + e.amount, 0);

  if (rawEntries.length === 0) return; // nothing to post (e.g. uncategorised transaction)

  if (Math.abs(totalDebits - totalCredits) > 0.005) {
    // One side is missing (e.g. no category assigned yet) — skip entirely so the
    // ledger stays clean. Entries will be generated when the transaction is saved again.
    console.warn(
      `[GL] Skipping tx=${txId} — out of balance: debits=${totalDebits.toFixed(2)} credits=${totalCredits.toFixed(2)}`
    );
    // Remove any partial entries already written
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
      entryType: e.entryType,
      amount: e.amount,
      description: e.description,
      date: tx.date,
      isVoid: false,
    });
  }
}

/**
 * Soft-void all GL entries for a given transaction.
 * Called when a transaction is voided/deleted.
 */
export async function voidGlEntries(txId: string, companyId: string): Promise<void> {
  await db
    .update(glEntries)
    .set({ isVoid: true, updatedAt: new Date() })
    .where(
      and(eq(glEntries.transactionId, txId), eq(glEntries.companyId, companyId))
    );
}
