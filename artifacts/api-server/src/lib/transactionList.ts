/**
 * Single source for listing transactions/splits for a company — matches the dashboard’s
 * explicit column pattern instead of select(), and retries without vendor_id when legacy
 * DBs lack that column (Postgres 42703).
 */
import { db, transactions, transactionSplits } from "@workspace/db";
import { eq, desc, asc, inArray } from "drizzle-orm";

/** Drizzle often throws one message ("Failed query: select …") while Postgres 42703 lives on `cause`. */
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; i < 10 && e; i++) {
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      if (o.code != null) parts.push(`code:${o.code}`);
      if (typeof o.detail === "string") parts.push(o.detail);
    }
    if (e instanceof Error) parts.push(e.message);
    else parts.push(String(e));
    e = (e as { cause?: unknown })?.cause;
  }
  return parts.join("\n");
}

/** True if this failure is almost certainly "vendor_id column missing" for `transactions`. */
function shouldRetryTransactionsWithoutVendorId(err: unknown): boolean {
  const t = errorChainText(err);
  if (!/vendor_id/i.test(t)) return false;
  if (/42703/.test(t)) return true;
  if (/does not exist/i.test(t)) return true;
  // Drizzle: full SQL in message but not always the Postgres wording
  if (/Failed query:/i.test(t) && /"transactions"/i.test(t) && !/transaction_splits/i.test(t)) return true;
  return false;
}

/** True if this failure is almost certainly "vendor_id column missing" on `transaction_splits`. */
function shouldRetrySplitsWithoutVendorId(err: unknown): boolean {
  const t = errorChainText(err);
  if (!/vendor_id/i.test(t)) return false;
  if (/42703/.test(t) && /transaction_splits/i.test(t)) return true;
  if (/does not exist/i.test(t) && /vendor_id/i.test(t)) return true;
  if (/Failed query:/i.test(t) && /transaction_splits/i.test(t)) return true;
  return false;
}

/** Core transaction columns (no vendor_id) — safe for older schemas. */
const transactionRowBase = {
  id: transactions.id,
  companyId: transactions.companyId,
  bankAccountId: transactions.bankAccountId,
  date: transactions.date,
  payee: transactions.payee,
  amount: transactions.amount,
  type: transactions.type,
  status: transactions.status,
  chartAccountId: transactions.chartAccountId,
  isSplit: transactions.isSplit,
  memo: transactions.memo,
  checkNumber: transactions.checkNumber,
  referenceNumber: transactions.referenceNumber,
  fundId: transactions.fundId,
  journalEntryId: transactions.journalEntryId,
  plaidTransactionId: transactions.plaidTransactionId,
  isVoid: transactions.isVoid,
  donorName: transactions.donorName,
  functionalType: transactions.functionalType,
  transactionFingerprint: transactions.transactionFingerprint,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
} as const;

const transactionRowWithVendor = {
  ...transactionRowBase,
  vendorId: transactions.vendorId,
} as const;

export async function listTransactionRowsForCompany(companyId: string) {
  const where = eq(transactions.companyId, companyId);
  const orderBy = [desc(transactions.date), desc(transactions.createdAt)] as const;
  try {
    return await db
      .select(transactionRowWithVendor)
      .from(transactions)
      .where(where)
      .orderBy(...orderBy);
  } catch (e) {
    if (!shouldRetryTransactionsWithoutVendorId(e)) throw e;
    const rows = await db
      .select(transactionRowBase)
      .from(transactions)
      .where(where)
      .orderBy(...orderBy);
    return rows.map((r) => ({ ...r, vendorId: null as string | null }));
  }
}

const splitRowBase = {
  id: transactionSplits.id,
  transactionId: transactionSplits.transactionId,
  chartAccountId: transactionSplits.chartAccountId,
  amount: transactionSplits.amount,
  memo: transactionSplits.memo,
  functionalType: transactionSplits.functionalType,
  sortOrder: transactionSplits.sortOrder,
  createdAt: transactionSplits.createdAt,
  updatedAt: transactionSplits.updatedAt,
} as const;

const splitRowWithVendor = {
  ...splitRowBase,
  vendorId: transactionSplits.vendorId,
} as const;

const SPLIT_CHUNK = 500;

export async function loadSplitRowsByTransactionIds(txIds: string[]): Promise<any[]> {
  if (txIds.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < txIds.length; i += SPLIT_CHUNK) {
    const chunk = txIds.slice(i, i + SPLIT_CHUNK);
    try {
      const rows = await db
        .select(splitRowWithVendor)
        .from(transactionSplits)
        .where(inArray(transactionSplits.transactionId, chunk))
        .orderBy(asc(transactionSplits.transactionId), asc(transactionSplits.sortOrder));
      out.push(...rows);
    } catch (e) {
      if (!shouldRetrySplitsWithoutVendorId(e)) throw e;
      const rows = await db
        .select(splitRowBase)
        .from(transactionSplits)
        .where(inArray(transactionSplits.transactionId, chunk))
        .orderBy(asc(transactionSplits.transactionId), asc(transactionSplits.sortOrder));
      out.push(...rows.map((r) => ({ ...r, vendorId: null as string | null })));
    }
  }
  return out;
}
