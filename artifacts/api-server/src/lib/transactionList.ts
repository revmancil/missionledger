/**
 * Single source for listing transactions/splits for a company — explicit column selects
 * (like the dashboard) plus fallbacks for legacy Postgres where optional columns are missing.
 */
import { db, transactions, transactionSplits } from "@workspace/db";
import { eq, desc, asc, inArray, sql } from "drizzle-orm";

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
  if (/Failed query:/i.test(t) && /"transactions"/i.test(t) && !/transaction_splits/i.test(t)) return true;
  return false;
}

function normalizeSplitRow(r: Record<string, unknown>): any {
  return {
    ...r,
    vendorId: r.vendorId ?? null,
    memo: r.memo ?? null,
    functionalType: r.functionalType ?? null,
    sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : 0,
  };
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

/** No functional_type (older transaction_splits). */
const splitNoFunctional = {
  id: transactionSplits.id,
  transactionId: transactionSplits.transactionId,
  chartAccountId: transactionSplits.chartAccountId,
  amount: transactionSplits.amount,
  memo: transactionSplits.memo,
  sortOrder: transactionSplits.sortOrder,
  createdAt: transactionSplits.createdAt,
  updatedAt: transactionSplits.updatedAt,
} as const;

/** No memo (some legacy tables). */
const splitNoMemoWithSort = {
  id: transactionSplits.id,
  transactionId: transactionSplits.transactionId,
  chartAccountId: transactionSplits.chartAccountId,
  amount: transactionSplits.amount,
  sortOrder: transactionSplits.sortOrder,
  createdAt: transactionSplits.createdAt,
  updatedAt: transactionSplits.updatedAt,
} as const;

/** No sort_order — do not reference it in ORDER BY. */
const splitNoSortOrder = {
  id: transactionSplits.id,
  transactionId: transactionSplits.transactionId,
  chartAccountId: transactionSplits.chartAccountId,
  amount: transactionSplits.amount,
  memo: transactionSplits.memo,
  createdAt: transactionSplits.createdAt,
  updatedAt: transactionSplits.updatedAt,
} as const;

const splitMinimal = {
  id: transactionSplits.id,
  transactionId: transactionSplits.transactionId,
  chartAccountId: transactionSplits.chartAccountId,
  amount: transactionSplits.amount,
  createdAt: transactionSplits.createdAt,
  updatedAt: transactionSplits.updatedAt,
} as const;

const SPLIT_CHUNK = 500;

const txIdAsc = asc(transactionSplits.transactionId);
const sortAsc = asc(transactionSplits.sortOrder);
const idAsc = asc(transactionSplits.id);

/** Last resort: plain SQL so Drizzle column mapping cannot block legacy DBs. */
async function selectSplitsChunkRaw(chunk: string[]): Promise<any[]> {
  if (chunk.length === 0) return [];
  const result = await db.execute(sql`
    SELECT id, transaction_id, chart_account_id, amount, created_at, updated_at
    FROM public.transaction_splits
    WHERE transaction_id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
    ORDER BY transaction_id ASC, id ASC
  `);
  const raw = (result as { rows: Record<string, unknown>[] }).rows;
  return raw.map((r) =>
    normalizeSplitRow({
      id: r.id,
      transactionId: r.transaction_id,
      chartAccountId: r.chart_account_id,
      amount: r.amount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } as Record<string, unknown>),
  );
}

async function selectSplitsForChunk(chunk: string[]): Promise<any[]> {
  // Try minimal column sets early: many prod DBs omit vendor_id, memo, functional_type, or sort_order.
  const attempts: Array<
    | { kind: "drizzle"; sel: typeof splitRowWithVendor; order: ReturnType<typeof asc>[] }
    | { kind: "raw" }
  > = [
  { kind: "drizzle", sel: splitRowWithVendor, order: [txIdAsc, sortAsc] },
  { kind: "drizzle", sel: splitRowBase, order: [txIdAsc, sortAsc] },
  { kind: "drizzle", sel: splitNoFunctional, order: [txIdAsc, sortAsc] },
  { kind: "drizzle", sel: splitNoMemoWithSort, order: [txIdAsc, sortAsc] },
  { kind: "drizzle", sel: splitNoSortOrder, order: [txIdAsc, idAsc] },
  { kind: "drizzle", sel: splitMinimal, order: [txIdAsc, idAsc] },
  { kind: "raw" },
  ];

  let lastErr: unknown;
  for (const att of attempts) {
    try {
      if (att.kind === "raw") {
        return await selectSplitsChunkRaw(chunk);
      }
      const rows = await db
        .select(att.sel)
        .from(transactionSplits)
        .where(inArray(transactionSplits.transactionId, chunk))
        .orderBy(...att.order);
      return rows.map((r) => normalizeSplitRow(r as Record<string, unknown>));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function loadSplitRowsByTransactionIds(txIds: string[]): Promise<any[]> {
  if (txIds.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < txIds.length; i += SPLIT_CHUNK) {
    const chunk = txIds.slice(i, i + SPLIT_CHUNK);
    const rows = await selectSplitsForChunk(chunk);
    out.push(...rows);
  }
  return out;
}
