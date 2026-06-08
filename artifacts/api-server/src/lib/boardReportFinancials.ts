import { db, chartOfAccounts, glEntries, journalEntries, funds } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

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
  const [coaRows, glRows, fundRows, voidJeIds] = await Promise.all([
    db
      .select({
        id: chartOfAccounts.id,
        code: chartOfAccounts.code,
        name: chartOfAccounts.name,
        type: chartOfAccounts.type,
      })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId)),
    db
      .select({
        accountId: glEntries.accountId,
        fundId: glEntries.fundId,
        entryType: glEntries.entryType,
        amount: glEntries.amount,
        journalEntryId: glEntries.journalEntryId,
      })
      .from(glEntries)
      .where(and(
        eq(glEntries.companyId, companyId),
        eq(glEntries.isVoid, false),
        lte(glEntries.date, asOfEnd),
      )),
    db
      .select({ id: funds.id, fundType: funds.fundType })
      .from(funds)
      .where(eq(funds.companyId, companyId)),
    loadVoidJournalEntryIds(companyId),
  ]);

  const coaMap = new Map(coaRows.map((c) => [c.id, c]));
  const fundTypeMap = new Map(fundRows.map((f) => [f.id, f.fundType]));

  const assetLiabByAccount: Record<string, { code: string; name: string; type: string; debit: number; credit: number }> = {};

  let unrestrictedEquity = 0;
  let unrestrictedIncome = 0;
  let unrestrictedExpense = 0;
  let restrictedEquity = 0;
  let restrictedIncome = 0;
  let restrictedExpense = 0;

  for (const g of glRows) {
    if (isOrphanedGlEntry(g.journalEntryId, voidJeIds)) continue;
    const coa = coaMap.get(g.accountId);
    if (!coa) continue;

    const coaType = coa.type;
    const debit = g.entryType === "DEBIT" ? g.amount : 0;
    const credit = g.entryType === "CREDIT" ? g.amount : 0;

    if (coaType === "ASSET" || coaType === "LIABILITY") {
      if (!assetLiabByAccount[g.accountId]) {
        assetLiabByAccount[g.accountId] = { code: coa.code, name: coa.name, type: coaType, debit: 0, credit: 0 };
      }
      assetLiabByAccount[g.accountId].debit += debit;
      assetLiabByAccount[g.accountId].credit += credit;
      continue;
    }

    if (coaType !== "EQUITY" && coaType !== "INCOME" && coaType !== "EXPENSE") continue;

    const fundType = g.fundId ? (fundTypeMap.get(g.fundId) ?? "UNRESTRICTED") : "UNRESTRICTED";
    const isUnrestricted = fundType === "UNRESTRICTED";
    const balance = coaType === "EXPENSE" ? debit - credit : credit - debit;

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

  const assets: Array<{ accountCode: string; accountName: string; amount: number }> = [];
  const liabilities: Array<{ accountCode: string; accountName: string; amount: number }> = [];

  for (const acc of Object.values(assetLiabByAccount)) {
    const gross = acc.debit + acc.credit;
    const amount = acc.type === "ASSET" ? acc.debit - acc.credit : acc.credit - acc.debit;
    if (!hasBalance(amount, gross)) continue;
    const line = { accountCode: acc.code, accountName: acc.name, amount: round2(amount) };
    if (acc.type === "ASSET") assets.push(line);
    else liabilities.push(line);
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
