import { db, bankAccounts } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { firstSqlRow } from "./sqlRows";

/** Recompute bank_accounts.current_balance from non-void register transactions. */
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
  const balance = parseFloat(String((firstSqlRow(result) as { balance?: unknown })?.balance ?? "0")) || 0;
  await db
    .update(bankAccounts)
    .set({ currentBalance: balance, updatedAt: new Date() })
    .where(eq(bankAccounts.id, bankAccountId));
}
