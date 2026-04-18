import { db, bankAccounts, glEntries } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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
  const [bank] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.glAccountId, glAccountId), eq(bankAccounts.companyId, companyId)));

  if (!bank?.id) return; // No bank account linked to this GL account
  await recomputeBankBalanceFromTransactions(bank.id, companyId);
}
