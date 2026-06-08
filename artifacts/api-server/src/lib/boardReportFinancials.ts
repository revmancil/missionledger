import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sqlRows } from "./sqlRows";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasBalance(amount: number, gross: number): boolean {
  return Math.abs(amount) >= 0.005 || gross > 0.005;
}

export interface HighLevelPlLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface HighLevelProfitLoss {
  startDate: string;
  endDate: string;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  topRevenue: HighLevelPlLine[];
  topExpenses: HighLevelPlLine[];
}

export interface HighLevelBalanceSheet {
  asOfDate: string;
  totalAssets: number;
  totalLiabilities: number;
  totalNetAssets: number;
  totalUnrestrictedNetAssets: number;
  totalRestrictedNetAssets: number;
  netIncome: number;
  topAssets: Array<{ accountCode: string; accountName: string; amount: number }>;
  topLiabilities: Array<{ accountCode: string; accountName: string; amount: number }>;
}

export async function buildHighLevelProfitLoss(
  companyId: string,
  start: Date,
  end: Date,
  startYmd: string,
  endYmd: string,
): Promise<HighLevelProfitLoss> {
  const glRows = await db.execute(sql`
    SELECT
      c.code AS account_code,
      c.name AS account_name,
      c.coa_type AS account_type,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM gl_entries g
    INNER JOIN chart_of_accounts c ON c.id = g.account_id AND c.company_id = g.company_id
    LEFT JOIN journal_entries je ON je.id = g.journal_entry_id
    WHERE g.company_id = ${companyId}
      AND g.is_void = false
      AND g.date >= ${start}
      AND g.date <= ${end}
      AND c.coa_type IN ('INCOME', 'EXPENSE')
      AND (g.journal_entry_id IS NULL OR (je.id IS NOT NULL AND je.status != 'VOID'))
    GROUP BY c.code, c.name, c.coa_type, c.sort_order
    ORDER BY c.sort_order, c.code
  `);

  const revenue: HighLevelPlLine[] = [];
  const expenses: HighLevelPlLine[] = [];

  for (const r of sqlRows(glRows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? 0)) || 0;
    const credit = parseFloat(String(r.total_credit ?? 0)) || 0;
    const gross = debit + credit;
    const accountType = String(r.account_type ?? "");
    const amount = accountType === "INCOME" ? credit - debit : debit - credit;
    if (!hasBalance(amount, gross)) continue;
    const line = {
      accountCode: String(r.account_code ?? ""),
      accountName: String(r.account_name ?? ""),
      amount: round2(amount),
    };
    if (accountType === "INCOME") revenue.push(line);
    else expenses.push(line);
  }

  const totalRevenue = round2(revenue.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round2(expenses.reduce((s, r) => s + r.amount, 0));

  return {
    startDate: startYmd,
    endDate: endYmd,
    totalRevenue,
    totalExpenses,
    netIncome: round2(totalRevenue - totalExpenses),
    topRevenue: [...revenue].sort((a, b) => b.amount - a.amount).slice(0, 6),
    topExpenses: [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 6),
  };
}

export async function buildHighLevelBalanceSheet(
  companyId: string,
  asOfEnd: Date,
  asOfYmd: string,
): Promise<HighLevelBalanceSheet> {
  const assetLiabRows = await db.execute(sql`
    SELECT
      c.code AS account_code,
      c.name AS account_name,
      c.coa_type AS account_type,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM chart_of_accounts c
    LEFT JOIN gl_entries g
      ON g.account_id = c.id AND g.company_id = ${companyId} AND g.is_void = false AND g.date <= ${asOfEnd}
    LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status != 'VOID'
    WHERE c.company_id = ${companyId}
      AND c.coa_type IN ('ASSET', 'LIABILITY')
      AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    GROUP BY c.code, c.name, c.coa_type, c.sort_order
    ORDER BY c.sort_order, c.code
  `);

  const netAssetRows = await db.execute(sql`
    SELECT
      c.coa_type AS account_type,
      COALESCE(f.fund_type::text, 'UNRESTRICTED') AS fund_type,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
      ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
    FROM chart_of_accounts c
    LEFT JOIN gl_entries g
      ON g.account_id = c.id AND g.company_id = ${companyId} AND g.is_void = false AND g.date <= ${asOfEnd}
    LEFT JOIN journal_entries je ON je.id = g.journal_entry_id AND je.status != 'VOID'
    LEFT JOIN funds f ON f.id = g.fund_id AND f.company_id = ${companyId}
    WHERE c.company_id = ${companyId}
      AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
      AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
    GROUP BY c.coa_type, COALESCE(f.fund_type::text, 'UNRESTRICTED')
  `);

  const assets: Array<{ accountCode: string; accountName: string; amount: number }> = [];
  const liabilities: Array<{ accountCode: string; accountName: string; amount: number }> = [];

  for (const r of sqlRows(assetLiabRows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? 0)) || 0;
    const credit = parseFloat(String(r.total_credit ?? 0)) || 0;
    const gross = debit + credit;
    const accountType = String(r.account_type ?? "");
    const amount = accountType === "ASSET" ? debit - credit : credit - debit;
    if (!hasBalance(amount, gross)) continue;
    const line = {
      accountCode: String(r.account_code ?? ""),
      accountName: String(r.account_name ?? ""),
      amount: round2(amount),
    };
    if (accountType === "ASSET") assets.push(line);
    else liabilities.push(line);
  }

  let unrestrictedIncome = 0;
  let unrestrictedExpense = 0;
  let restrictedIncome = 0;
  let restrictedExpense = 0;
  let unrestrictedEquity = 0;
  let restrictedEquity = 0;

  for (const r of sqlRows(netAssetRows) as Record<string, unknown>[]) {
    const debit = parseFloat(String(r.total_debit ?? 0)) || 0;
    const credit = parseFloat(String(r.total_credit ?? 0)) || 0;
    const coaType = String(r.account_type ?? "");
    const fundType = String(r.fund_type ?? "UNRESTRICTED");
    const balance = coaType === "EXPENSE" ? debit - credit : credit - debit;
    const isUnrestricted = fundType === "UNRESTRICTED";
    if (coaType === "EQUITY") {
      if (isUnrestricted) unrestrictedEquity += balance;
      else restrictedEquity += balance;
    } else if (coaType === "INCOME") {
      if (isUnrestricted) unrestrictedIncome += balance;
      else restrictedIncome += balance;
    } else if (coaType === "EXPENSE") {
      if (isUnrestricted) unrestrictedExpense += balance;
      else restrictedExpense += balance;
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
    totalAssets,
    totalLiabilities,
    totalNetAssets,
    totalUnrestrictedNetAssets,
    totalRestrictedNetAssets,
    netIncome,
    topAssets: [...assets].sort((a, b) => b.amount - a.amount).slice(0, 6),
    topLiabilities: [...liabilities].sort((a, b) => b.amount - a.amount).slice(0, 6),
  };
}
