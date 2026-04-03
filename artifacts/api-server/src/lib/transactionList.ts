/**
 * Single source for listing transactions/splits for a company — matches the dashboard’s
 * explicit column pattern instead of select(), and retries without vendor_id when legacy
 * DBs lack that column (Postgres 42703).
 */
import { db, transactions, transactionSplits } from "@workspace/db";
import { eq, desc, asc, inArray } from "drizzle-orm";

function isPostgresUndefinedColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === "42703") return true;
  const m = String(e?.message ?? "");
  return /column .* does not exist/i.test(m);
}

function isMissingVendorId(err: unknown): boolean {
  if (!isPostgresUndefinedColumn(err)) return false;
  return /vendor_id/i.test(String((err as Error)?.message ?? ""));
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
    if (!isMissingVendorId(e)) throw e;
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
      if (!isMissingVendorId(e)) throw e;
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
