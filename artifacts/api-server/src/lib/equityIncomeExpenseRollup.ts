import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sqlRows } from "./sqlRows";

/** Map a net-asset equity row to the standard P&amp;L bucket (seed codes or sortOrder 211–213). */
export function equityNetAssetBucketKey(acct: {
  code: string;
  sortOrder: number | null;
}): "3100" | "3200" | "3300" | null {
  const c = String(acct.code ?? "").trim();
  if (c === "3100") return "3100";
  if (c === "3200") return "3200";
  if (c === "3300") return "3300";
  const so = acct.sortOrder ?? 0;
  if (so === 211) return "3100";
  if (so === 212) return "3200";
  if (so === 213) return "3300";
  return null;
}

/**
 * Net Statement-of-Activities impact (INCOME − EXPENSE in credit-normal dollars)
 * rolled up by restriction bucket matching the seeded net-asset equity codes:
 *   3100 Unrestricted, 3200 Temporarily restricted, 3300 Permanently restricted.
 *
 * Bank-register and JE-sourced gl_entries are included. GL rows tied only to VOID
 * journal entries are excluded (same rule as balance sheet).
 */
export async function operationalNetByEquityAccountCode(
  companyId: string,
): Promise<Record<string, number>> {
  const rows = await db.execute(sql`
    SELECT
      c.coa_type::text AS account_type,
      COALESCE(f.fund_type::text, 'UNRESTRICTED') AS fund_type,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM gl_entries g
    INNER JOIN chart_of_accounts c ON c.id = g.account_id AND c.company_id = ${companyId}
    LEFT JOIN funds f ON f.id = g.fund_id AND f.company_id = ${companyId}
    LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status <> 'VOID'
    WHERE g.company_id = ${companyId}
      AND g.is_void = false
      AND c.coa_type IN ('INCOME', 'EXPENSE')
      AND (g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    GROUP BY c.coa_type::text, COALESCE(f.fund_type::text, 'UNRESTRICTED')
  `);

  const out: Record<string, number> = { "3100": 0, "3200": 0, "3300": 0 };
  for (const r of sqlRows(rows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? r.TOTAL_DEBIT ?? "0")) || 0;
    const credit = parseFloat(String(r.total_credit ?? r.TOTAL_CREDIT ?? "0")) || 0;
    const coaType = String(r.account_type ?? r.ACCOUNT_TYPE ?? "").toUpperCase();
    const balance = coaType === "EXPENSE" ? debit - credit : credit - debit;
    const ft = String(r.fund_type ?? r.FUND_TYPE ?? "UNRESTRICTED").toUpperCase();
    let bucket: keyof typeof out;
    if (ft === "UNRESTRICTED") bucket = "3100";
    else if (ft === "RESTRICTED_PERM") bucket = "3300";
    else bucket = "3200";
    out[bucket] = (out[bucket] ?? 0) + balance;
  }
  return out;
}
