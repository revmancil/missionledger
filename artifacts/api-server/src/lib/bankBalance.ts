import { db, bankAccounts, glEntries, chartOfAccounts, accounts } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { firstSqlRow } from "./sqlRows";

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
    // Bank has an explicit GL account link — sum only entries for that account
    const jeResult = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS balance
      FROM gl_entries
      WHERE account_id = ${bank.glAccountId}
        AND company_id = ${companyId}
        AND source_type = 'MANUAL_JE'
        AND (is_void IS NULL OR is_void = false)
    `);
    jeBalance = parseFloat(String((firstSqlRow(jeResult) as { balance?: unknown })?.balance ?? "0")) || 0;
  } else {
    // Bank has no GL account link — sum MANUAL_JE entries against any ASSET account
    // (in either chart_of_accounts OR the legacy accounts table) not claimed by another bank.
    // Legacy account IDs appear in GL entries for JEs created before the COA form fix.
    const jeResult = await db.execute(sql`
      SELECT COALESCE(SUM(CASE WHEN ge.entry_type = 'CREDIT' THEN ge.amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN ge.entry_type = 'DEBIT'  THEN ge.amount ELSE 0 END), 0) AS balance
      FROM gl_entries ge
      WHERE ge.company_id = ${companyId}
        AND ge.source_type = 'MANUAL_JE'
        AND (ge.is_void IS NULL OR ge.is_void = false)
        AND ge.account_id NOT IN (
          SELECT gl_account_id FROM bank_accounts
          WHERE company_id = ${companyId} AND gl_account_id IS NOT NULL
        )
        AND (
          EXISTS (
            SELECT 1 FROM chart_of_accounts coa
            WHERE coa.id = ge.account_id AND coa.company_id = ${companyId} AND coa.coa_type = 'ASSET'
          )
          OR EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = ge.account_id AND a.company_id = ${companyId} AND a.type = 'ASSET'
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
