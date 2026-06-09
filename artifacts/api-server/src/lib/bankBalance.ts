import { db, bankAccounts, chartOfAccounts, accounts } from "@workspace/db";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { firstSqlRow } from "./sqlRows";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Case/whitespace-tolerant match between COA ids and bank_accounts.gl_account_id (both text). */
export function normAccountId(id: unknown): string {
  if (id == null) return "";
  return String(id).trim().toLowerCase();
}

export type CashAssetLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
};

/**
 * Recompute bank_accounts.current_balance from non-void register transactions.
 * Used by the transaction routes (create/update/delete).
 */
export async function recomputeBankBalanceFromTransactions(
  bankAccountId: string | null | undefined,
  companyId: string,
): Promise<void> {
  if (!bankAccountId) return;
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS balance
    FROM transactions
    WHERE bank_account_id = ${bankAccountId}
      AND company_id = ${companyId}
      AND is_void = false
  `);
  const txBalance = parseFloat(String((firstSqlRow(result) as { balance?: unknown })?.balance ?? "0")) || 0;

  // Also include JE GL entries that hit this bank's GL account
  const [bank] = await db
    .select({ glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));

  let jeBalance = 0;
  if (bank?.glAccountId) {
    const jeResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS balance
      FROM gl_entries g
      LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status <> 'VOID'
      WHERE g.account_id = ${bank.glAccountId}
        AND g.company_id = ${companyId}
        AND g.source_type = 'MANUAL_JE'
        AND g.is_void = false
        AND (g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    `);
    jeBalance = parseFloat(String((firstSqlRow(jeResult) as { balance?: unknown })?.balance ?? "0")) || 0;
  } else {
    const jeResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS balance
      FROM gl_entries g
      LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status <> 'VOID'
      WHERE g.company_id = ${companyId}
        AND g.source_type = 'MANUAL_JE'
        AND g.is_void = false
        AND (g.journal_entry_id IS NULL OR je.id IS NOT NULL)
        AND g.account_id NOT IN (
          SELECT gl_account_id FROM bank_accounts
          WHERE company_id = ${companyId} AND gl_account_id IS NOT NULL
        )
        AND (
          EXISTS (
            SELECT 1 FROM chart_of_accounts coa
            WHERE coa.id = g.account_id AND coa.company_id = ${companyId} AND coa.coa_type = 'ASSET'
          )
          OR EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = g.account_id AND a.company_id = ${companyId} AND a.type = 'ASSET'
          )
        )
    `);
    jeBalance = parseFloat(String((firstSqlRow(jeResult) as { balance?: unknown })?.balance ?? "0")) || 0;
  }

  await db
    .update(bankAccounts)
    .set({ currentBalance: txBalance + jeBalance, updatedAt: new Date() })
    .where(eq(bankAccounts.id, bankAccountId));
}

/**
 * Recompute balance for a bank account identified by its GL account ID.
 * Called after posting or voiding a journal entry.
 */
export async function recomputeBankBalanceByGlAccount(
  glAccountId: string,
  companyId: string,
): Promise<void> {
  // First try: find a bank that explicitly links to this GL account
  let [bank] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.glAccountId, glAccountId), eq(bankAccounts.companyId, companyId)));

  // Second try: if no bank explicitly links to this GL account, check if it's an ASSET account
  // in either chart_of_accounts or the legacy accounts table. GL entries for JEs created
  // before the COA form fix carry legacy account IDs, not COA IDs.
  if (!bank?.id) {
    const [coa] = await db
      .select({ type: chartOfAccounts.type })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, glAccountId), eq(chartOfAccounts.companyId, companyId)));

    const [legacy] = !coa
      ? await db
          .select({ type: accounts.type })
          .from(accounts)
          .where(and(eq(accounts.id, glAccountId), eq(accounts.companyId, companyId)))
      : [];

    const accountType = coa?.type ?? legacy?.type ?? null;
    if (accountType === "ASSET") {
      // Find the first bank without a linked GL account
      [bank] = await db
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.companyId, companyId), isNull(bankAccounts.glAccountId)));
    }
  }

  if (!bank?.id) return;
  await recomputeBankBalanceFromTransactions(bank.id, companyId);
}

/**
 * Bank register balance through an as-of date: cleared register activity plus
 * manual journal entries on the linked GL cash account (asset-normal: debits − credits).
 */
export async function bankRegisterBalanceAsOf(
  bankAccountId: string,
  companyId: string,
  asOfEnd: Date,
): Promise<number> {
  const txResult = await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS balance
    FROM transactions
    WHERE bank_account_id = ${bankAccountId}
      AND company_id = ${companyId}
      AND is_void = false
      AND date <= ${asOfEnd}
  `);
  const txBalance = parseFloat(String((firstSqlRow(txResult) as { balance?: unknown })?.balance ?? "0")) || 0;

  const [bank] = await db
    .select({ glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));

  let jeBalance = 0;
  if (bank?.glAccountId) {
    const jeResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS balance
      FROM gl_entries g
      LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status <> 'VOID'
      WHERE g.account_id = ${bank.glAccountId}
        AND g.company_id = ${companyId}
        AND g.source_type = 'MANUAL_JE'
        AND g.is_void = false
        AND g.date <= ${asOfEnd}
        AND (g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    `);
    jeBalance = parseFloat(String((firstSqlRow(jeResult) as { balance?: unknown })?.balance ?? "0")) || 0;
  }

  return Math.round((txBalance + jeBalance) * 100) / 100;
}

/** Map linked GL account id → register balance as-of date (one entry per bank). */
export async function bankRegisterBalancesByGlAccount(
  companyId: string,
  asOfEnd: Date,
): Promise<Map<string, number>> {
  const banks = await db
    .select({ id: bankAccounts.id, glAccountId: bankAccounts.glAccountId })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), sql`${bankAccounts.glAccountId} IS NOT NULL`));

  const out = new Map<string, number>();
  for (const bank of banks) {
    if (!bank.glAccountId) continue;
    const balance = await bankRegisterBalanceAsOf(bank.id, companyId, asOfEnd);
    out.set(bank.glAccountId, balance);
  }
  return out;
}

/**
 * Replace bank-linked cash asset lines with register balances as-of the report date.
 * Bank statements and reconciliation use the register; raw GL on cash can drift when
 * opening-balance JE rows and transaction GL are both present or categories are pending.
 */
export async function mergeBankRegisterIntoCashAssets<T extends CashAssetLine>(
  companyId: string,
  asOfEnd: Date,
  assets: T[],
): Promise<T[]> {
  const registerByGl = await bankRegisterBalancesByGlAccount(companyId, asOfEnd);
  if (registerByGl.size === 0) return assets;

  const byId = new Map(assets.map((a) => [normAccountId(a.accountId), { ...a }]));

  for (const [glAccountId, registerBal] of registerByGl) {
    const row = byId.get(normAccountId(glAccountId));
    if (row) {
      row.amount = round2(registerBal);
    }
  }

  const missingGlIds = [...registerByGl.keys()].filter((id) => !byId.has(normAccountId(id)));
  if (missingGlIds.length > 0) {
    const coaRows = await db
      .select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), inArray(chartOfAccounts.id, missingGlIds)));
    for (const coa of coaRows) {
      const bal = registerByGl.get(coa.id);
      if (bal == null || Math.abs(bal) < 0.005) continue;
      byId.set(coa.id, {
        accountId: coa.id,
        accountCode: coa.code,
        accountName: coa.name,
        amount: round2(bal),
      } as T);
    }
  }

  return [...byId.values()];
}
