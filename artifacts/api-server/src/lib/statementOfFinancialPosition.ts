import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sqlRows } from "./sqlRows";
import { hasReportBalance, sqlCoaActiveOrHasGlInWindow } from "./reportCoaGlWindow";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SofpLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface StatementOfFinancialPosition {
  asOfDate: string;
  assets: SofpLine[];
  liabilities: SofpLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalNetAssets: number;
  totalUnrestrictedNetAssets: number;
  totalRestrictedNetAssets: number;
  netIncome: number;
}

/**
 * Statement of Financial Position through as-of — same rules as GET /reports/balance-sheet.
 */
export async function buildStatementOfFinancialPosition(
  companyId: string,
  asOfEnd: Date,
  asOfYmd: string,
): Promise<StatementOfFinancialPosition> {
  const assetLiabRows = await db.execute(sql`
    SELECT
      c.id              AS account_id,
      c.code            AS account_code,
      c.name            AS account_name,
      c.coa_type        AS account_type,
      c.sort_order      AS sort_order,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM chart_of_accounts c
    LEFT JOIN gl_entries g
      ON g.account_id = c.id
      AND g.company_id = ${companyId}
      AND g.is_void = false
      AND g.date <= ${asOfEnd}
    LEFT JOIN journal_entries je
      ON je.id = g.journal_entry_id
      AND je.status != 'VOID'
    WHERE c.company_id = ${companyId}
      AND ${sqlCoaActiveOrHasGlInWindow(companyId, { kind: "through", end: asOfEnd })}
      AND c.coa_type IN ('ASSET', 'LIABILITY')
      AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
    ORDER BY c.sort_order, c.code
  `);

  const netAssetRows = await db.execute(sql`
    SELECT
      c.coa_type        AS account_type,
      COALESCE(f.fund_type, 'UNRESTRICTED') AS fund_type,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM chart_of_accounts c
    LEFT JOIN gl_entries g
      ON g.account_id = c.id
      AND g.company_id = ${companyId}
      AND g.is_void = false
      AND g.date <= ${asOfEnd}
    LEFT JOIN journal_entries je
      ON je.id = g.journal_entry_id
      AND je.status != 'VOID'
    LEFT JOIN funds f ON f.id = g.fund_id AND f.company_id = ${companyId}
    WHERE c.company_id = ${companyId}
      AND ${sqlCoaActiveOrHasGlInWindow(companyId, { kind: "through", end: asOfEnd })}
      AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
      AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    GROUP BY c.coa_type, COALESCE(f.fund_type, 'UNRESTRICTED')
  `);

  const assets: SofpLine[] = [];
  const liabilities: SofpLine[] = [];

  for (const r of sqlRows(assetLiabRows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? 0)) || 0;
    const credit = parseFloat(String(r.total_credit ?? 0)) || 0;
    const gross = debit + credit;
    const accountType = String(r.account_type ?? "");
    const amount = accountType === "ASSET" ? debit - credit : credit - debit;
    if (!hasReportBalance(amount, gross)) continue;
    const line: SofpLine = {
      accountId: String(r.account_id ?? ""),
      accountCode: String(r.account_code ?? ""),
      accountName: String(r.account_name ?? ""),
      amount: round2(amount),
    };
    if (accountType === "ASSET") assets.push(line);
    else liabilities.push(line);
  }

  let unrestrictedEquity = 0;
  let restrictedEquity = 0;
  let unrestrictedIncome = 0;
  let restrictedIncome = 0;
  let unrestrictedExpense = 0;
  let restrictedExpense = 0;

  for (const r of sqlRows(netAssetRows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? 0)) || 0;
    const credit = parseFloat(String(r.total_credit ?? 0)) || 0;
    const fundType = String(r.fund_type ?? "UNRESTRICTED");
    const coaType = String(r.account_type ?? "");
    const isUnrestricted = fundType === "UNRESTRICTED";
    const balance = coaType === "EXPENSE" ? debit - credit : credit - debit;

    if (isUnrestricted) {
      if (coaType === "EQUITY") unrestrictedEquity += balance;
      if (coaType === "INCOME") unrestrictedIncome += balance;
      if (coaType === "EXPENSE") unrestrictedExpense += balance;
    } else {
      if (coaType === "EQUITY") restrictedEquity += balance;
      if (coaType === "INCOME") restrictedIncome += balance;
      if (coaType === "EXPENSE") restrictedExpense += balance;
    }
  }

  const totalUnrestrictedNetAssets = round2(unrestrictedEquity + (unrestrictedIncome - unrestrictedExpense));
  const totalRestrictedNetAssets = round2(restrictedEquity + (restrictedIncome - restrictedExpense));
  const netIncome = round2((unrestrictedIncome + restrictedIncome) - (unrestrictedExpense + restrictedExpense));
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalNetAssets = round2(totalUnrestrictedNetAssets + totalRestrictedNetAssets);

  return {
    asOfDate: asOfYmd,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    totalNetAssets,
    totalUnrestrictedNetAssets,
    totalRestrictedNetAssets,
    netIncome,
  };
}
