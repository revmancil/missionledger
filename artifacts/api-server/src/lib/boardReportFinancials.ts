import { db, chartOfAccounts, glEntries, journalEntries } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { buildStatementOfFinancialPosition } from "./statementOfFinancialPosition";

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

async function loadVoidJournalEntryIds(companyId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.status, "VOID")));
  return new Set(rows.map((r) => r.id));
}

function isOrphanedGlEntry(journalEntryId: string | null, voidJeIds: Set<string>): boolean {
  return journalEntryId != null && voidJeIds.has(journalEntryId);
}

export async function buildHighLevelProfitLoss(
  companyId: string,
  start: Date,
  end: Date,
  startYmd: string,
  endYmd: string,
): Promise<HighLevelProfitLoss> {
  const [coaRows, glRows, voidJeIds] = await Promise.all([
    db
      .select({
        id: chartOfAccounts.id,
        code: chartOfAccounts.code,
        name: chartOfAccounts.name,
        type: chartOfAccounts.type,
      })
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
        inArray(chartOfAccounts.type, ["INCOME", "EXPENSE"]),
      )),
    db
      .select({
        accountId: glEntries.accountId,
        entryType: glEntries.entryType,
        amount: glEntries.amount,
        journalEntryId: glEntries.journalEntryId,
      })
      .from(glEntries)
      .where(and(
        eq(glEntries.companyId, companyId),
        eq(glEntries.isVoid, false),
        gte(glEntries.date, start),
        lte(glEntries.date, end),
      )),
    loadVoidJournalEntryIds(companyId),
  ]);

  const coaMap = new Map(coaRows.map((c) => [c.id, c]));
  const byAccount: Record<string, { code: string; name: string; type: string; debit: number; credit: number }> = {};

  for (const g of glRows) {
    if (isOrphanedGlEntry(g.journalEntryId, voidJeIds)) continue;
    const coa = coaMap.get(g.accountId);
    if (!coa) continue;
    if (!byAccount[g.accountId]) {
      byAccount[g.accountId] = { code: coa.code, name: coa.name, type: coa.type, debit: 0, credit: 0 };
    }
    if (g.entryType === "DEBIT") byAccount[g.accountId].debit += g.amount;
    else byAccount[g.accountId].credit += g.amount;
  }

  const revenue: HighLevelPlLine[] = [];
  const expenses: HighLevelPlLine[] = [];

  for (const acc of Object.values(byAccount)) {
    const gross = acc.debit + acc.credit;
    const amount = acc.type === "INCOME" ? acc.credit - acc.debit : acc.debit - acc.credit;
    if (!hasBalance(amount, gross)) continue;
    const line = { accountCode: acc.code, accountName: acc.name, amount: round2(amount) };
    if (acc.type === "INCOME") revenue.push(line);
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
  const sofp = await buildStatementOfFinancialPosition(companyId, asOfEnd, asOfYmd);

  const toTopLine = (lines: Array<{ accountCode: string; accountName: string; amount: number }>) =>
    [...lines]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 6)
      .map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: r.amount }));

  return {
    asOfDate: sofp.asOfDate,
    totalAssets: sofp.totalAssets,
    totalLiabilities: sofp.totalLiabilities,
    totalNetAssets: sofp.totalNetAssets,
    totalUnrestrictedNetAssets: sofp.totalUnrestrictedNetAssets,
    totalRestrictedNetAssets: sofp.totalRestrictedNetAssets,
    netIncome: sofp.netIncome,
    topAssets: toTopLine(sofp.assets),
    topLiabilities: toTopLine(sofp.liabilities),
  };
}
