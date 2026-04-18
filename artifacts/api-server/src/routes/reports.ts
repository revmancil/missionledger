import { Router } from "express";
import { db, accounts, bankAccounts, chartOfAccounts, journalEntries, journalEntryLines, donations, expenses, budgets, budgetLines, glEntries, funds, transactions, transactionSplits } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, isNotNull, isNull, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { sqlRows } from "../lib/sqlRows";
import { parseYmdToUtcDayBounds, utcYmdToday } from "../lib/safeIso";

const router = Router();

type ReportRangeOk = { ok: true; start: Date; end: Date; startYmd: string; endYmd: string };
type ReportRangeErr = { ok: false; error: string };

/** UTC calendar-day bounds for report queries; echoes YYYY-MM-DD for API clients (no local-date drift). */
function parseReportRange(startDate: unknown, endDate: unknown): ReportRangeOk | ReportRangeErr {
  const y = new Date().getUTCFullYear();
  const hasS = startDate != null && String(startDate).trim() !== "";
  const hasE = endDate != null && String(endDate).trim() !== "";
  const sParsed = hasS ? parseYmdToUtcDayBounds(startDate) : null;
  const eParsed = hasE ? parseYmdToUtcDayBounds(endDate) : null;
  if (hasS && !sParsed) return { ok: false, error: "Invalid startDate (use YYYY-MM-DD)." };
  if (hasE && !eParsed) return { ok: false, error: "Invalid endDate (use YYYY-MM-DD)." };
  const sb = sParsed ?? parseYmdToUtcDayBounds(`${y}-01-01`);
  const eb = eParsed ?? parseYmdToUtcDayBounds(utcYmdToday());
  if (!sb || !eb) return { ok: false, error: "Invalid report date range." };
  if (sb.from.getTime() > eb.to.getTime()) return { ok: false, error: "startDate must be on or before endDate." };
  return { ok: true, start: sb.from, end: eb.to, startYmd: sb.ymd, endYmd: eb.ymd };
}

function parseAsOfDay(asOfDate: unknown): { ok: true; end: Date; ymd: string } | { ok: false; error: string } {
  const has = asOfDate != null && String(asOfDate).trim() !== "";
  const b = has ? parseYmdToUtcDayBounds(asOfDate) : parseYmdToUtcDayBounds(utcYmdToday());
  if (!b) return { ok: false, error: "Invalid asOfDate (use YYYY-MM-DD)." };
  return { ok: true, end: b.to, ymd: b.ymd };
}

// GET /reports/profit-loss  — Statement of Activities from GL entries
router.get("/profit-loss", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    const glRows = await db.execute(sql`
      SELECT
        c.id        AS account_id,
        c.code      AS account_code,
        c.name      AS account_name,
        c.coa_type  AS account_type,
        c.sort_order AS sort_order,
        ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
        ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
      FROM chart_of_accounts c
      LEFT JOIN gl_entries g
        ON g.account_id = c.id
        AND g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
      WHERE c.company_id = ${companyId}
        AND c.is_active = true
        AND c.coa_type IN ('INCOME', 'EXPENSE')
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
      ORDER BY c.sort_order, c.code
    `);

    const rows = sqlRows(glRows).map((r) => {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      const amount = r.account_type === "INCOME" ? credit - debit : debit - credit;
      return {
        accountId:   r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        amount,
        children: [],
      };
    });

    const revenueRows  = rows.filter(r => r.accountType === "INCOME"   && r.amount !== 0);
    const expenseRows  = rows.filter(r => r.accountType === "EXPENSE"  && r.amount !== 0);
    const totalRevenue  = revenueRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

    res.json({
      startDate: range.startYmd,
      endDate:   range.endYmd,
      revenue:   revenueRows,
      expenses:  expenseRows,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    });
  } catch (error) {
    console.error("P&L error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/balance-sheet — Statement of Financial Position (with restricted/unrestricted split)
router.get("/balance-sheet", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    if (!companyId) {
      return res.status(400).json({ error: "No organization in session. Refresh the page or sign in again." });
    }
    const { asOfDate } = req.query;

    const asOfParsed = parseAsOfDay(asOfDate);
    if (!asOfParsed.ok) return res.status(400).json({ error: asOfParsed.error });
    const asOfEnd = asOfParsed.end;

    // ── 1. Asset & Liability rows (no fund split needed) ──────────────────────
    // LEFT JOIN journal_entries and filter je.status != 'VOID' to exclude any
    // orphaned GL entries whose parent journal entry was voided without propagating
    // is_void to the child GL rows (data-integrity guard).
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
        AND c.is_active = true
        AND c.coa_type IN ('ASSET', 'LIABILITY')
        AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
      ORDER BY c.sort_order, c.code
    `);

    // ── 1b. Bank balance overrides using currentBalance ───────────────────────
    // For banks with an explicit gl_account_id link, override the GL-derived balance
    // with currentBalance (which includes both register transactions and JE GL entries).
    // Banks without gl_account_id fall through to the raw GL balance from assetLiabRows.
    const allBanksResult = await db
      .select({
        id: bankAccounts.id,
        name: bankAccounts.name,
        glAccountId: bankAccounts.glAccountId,
        currentBalance: bankAccounts.currentBalance,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isActive, true)));

    // Build map: COA account id → currentBalance (linked banks only)
    const bankBalanceMap = new Map<string, number>();
    for (const ba of allBanksResult) {
      if (ba.glAccountId) {
        const bal = Number(ba.currentBalance) || 0;
        bankBalanceMap.set(ba.glAccountId, (bankBalanceMap.get(ba.glAccountId) || 0) + bal);
      }
    }

    // ── 2. Net Assets split by fund type (EQUITY + INCOME/EXPENSE by fund) ───
    // Join GL entries with funds table to get the fund_type for each entry.
    // UNRESTRICTED fund_type = 'UNRESTRICTED'
    // Everything else = restricted (RESTRICTED_TEMP, RESTRICTED_PERM, BOARD_DESIGNATED)
    // Also join journal_entries to exclude orphaned GL rows from VOID JEs.
    const netAssetRows = await db.execute(sql`
      SELECT
        c.id              AS account_id,
        c.code            AS account_code,
        c.name            AS account_name,
        c.coa_type        AS account_type,
        c.sort_order      AS sort_order,
        COALESCE(f.fund_type, 'UNRESTRICTED') AS fund_type,
        COALESCE(f.name, 'General') AS fund_name,
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
        AND c.is_active = true
        AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
        AND (g.id IS NULL OR g.journal_entry_id IS NULL OR je.id IS NOT NULL)
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order, f.fund_type, f.name
      ORDER BY c.sort_order, c.code
    `);

    // Map asset/liability rows — override GL balance with currentBalance for linked bank accounts
    const assetLiabMapped = sqlRows(assetLiabRows).map((r) => {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      let amount = r.account_type === "ASSET" ? debit - credit : credit - debit;
      // If this COA account is linked to a bank, use currentBalance (includes JE GL entries)
      if (r.account_type === "ASSET" && bankBalanceMap.has(r.account_id)) {
        amount = bankBalanceMap.get(r.account_id)!;
      }
      return { accountId: r.account_id, accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type, amount, isBankLinked: bankBalanceMap.has(r.account_id) };
    });

    const assets      = assetLiabMapped.filter(r => r.accountType === "ASSET"     && r.amount !== 0);
    const liabilities = assetLiabMapped.filter(r => r.accountType === "LIABILITY" && r.amount !== 0);

    // Map net asset rows — accumulate by (account, fund_type)
    // Separate into unrestricted (fund_type='UNRESTRICTED') vs restricted (all others)
    let unrestrictedEquity = 0;
    let restrictedEquity   = 0;
    let unrestrictedIncome = 0;
    let restrictedIncome   = 0;
    let unrestrictedExpense = 0;
    let restrictedExpense   = 0;

    // Per-fund restricted detail for display
    const restrictedByFund: Record<string, { fundName: string; fundType: string; equity: number; income: number; expense: number }> = {};

    for (const r of sqlRows(netAssetRows) as any[]) {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      const fundType = r.fund_type as string;
      const coaType  = r.account_type as string;
      const isUnrestricted = fundType === "UNRESTRICTED";

      // Normal balance: EQUITY, INCOME = credit-normal; EXPENSE = debit-normal
      const balance = coaType === "EXPENSE" ? debit - credit : credit - debit;

      if (isUnrestricted) {
        if (coaType === "EQUITY")  unrestrictedEquity  += balance;
        if (coaType === "INCOME")  unrestrictedIncome  += balance;
        if (coaType === "EXPENSE") unrestrictedExpense += balance;
      } else {
        const fkey = r.fund_name as string;
        if (!restrictedByFund[fkey]) {
          restrictedByFund[fkey] = { fundName: r.fund_name, fundType: r.fund_type, equity: 0, income: 0, expense: 0 };
        }
        if (coaType === "EQUITY")  restrictedByFund[fkey].equity  += balance;
        if (coaType === "INCOME")  restrictedByFund[fkey].income  += balance;
        if (coaType === "EXPENSE") restrictedByFund[fkey].expense += balance;
        if (coaType === "EQUITY")  restrictedEquity  += balance;
        if (coaType === "INCOME")  restrictedIncome  += balance;
        if (coaType === "EXPENSE") restrictedExpense += balance;
      }
    }

    const unrestrictedNetIncome = unrestrictedIncome - unrestrictedExpense;
    const restrictedNetIncome   = restrictedIncome   - restrictedExpense;

    const totalUnrestrictedNetAssets = unrestrictedEquity + unrestrictedNetIncome;
    const totalRestrictedNetAssets   = restrictedEquity   + restrictedNetIncome;

    // Restricted detail for display
    const restrictedFundDetails = Object.values(restrictedByFund).map(f => ({
      fundName: f.fundName,
      fundType: f.fundType,
      netAssets: f.equity + (f.income - f.expense),
    })).filter(f => f.netAssets !== 0);

    const totalAssets      = assets.reduce((s, r) => s + r.amount, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
    const totalNetAssets   = totalUnrestrictedNetAssets + totalRestrictedNetAssets;
    const netIncome        = unrestrictedNetIncome + restrictedNetIncome;

    // Unposted / uncategorized activity: the net difference between what the bank
    // register says (register-based assets) and what the GL income/expense accounts
    // reflect.  Non-zero when bank transactions have been imported but not yet
    // categorized to an income or expense account.  Displayed as a reconciling line
    // in the Net Assets section so the SoFP shows clearly what's unclassified.
    const unpostedActivity = Math.round((totalAssets - (totalLiabilities + totalNetAssets)) * 100) / 100;

    res.json({
      asOfDate: asOfParsed.ymd,
      assets,
      liabilities,
      totalAssets,
      totalLiabilities,
      // Net Assets (split)
      totalUnrestrictedNetAssets,
      totalRestrictedNetAssets,
      restrictedFundDetails,
      unrestrictedNetIncome,
      restrictedNetIncome,
      totalNetAssets,
      netIncome,
      // Reconciling item for uncategorized bank transactions
      unpostedActivity,
      // Legacy fields kept for compatibility
      equity: [],
      totalEquity: totalUnrestrictedNetAssets,
      // Balance check (should always be 0 after unpostedActivity is applied)
      difference: totalAssets - (totalLiabilities + totalNetAssets + unpostedActivity),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Balance sheet error:", msg, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/cash-flow
router.get("/cash-flow", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;
    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const end = range.end;

    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    const filteredDonations = allDonations.filter(d => new Date(d.date) >= start && new Date(d.date) <= end);
    const filteredExpenses = allExpenses.filter(e => new Date(e.date) >= start && new Date(e.date) <= end);

    const totalRevenue = filteredDonations.reduce((s, d) => s + (d.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    res.json({
      startDate: range.startYmd,
      endDate: range.endYmd,
      operating: [
        { accountId: "op-1", accountCode: "4000", accountName: "Donations Received", amount: totalRevenue, children: [] },
        { accountId: "op-2", accountCode: "5000", accountName: "Operating Expenses", amount: -totalExpenses, children: [] },
      ],
      totalCashFlow: totalRevenue - totalExpenses,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/budget-vs-actual
router.get("/budget-vs-actual", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const allBudgets = await db.select().from(budgets).where(eq(budgets.companyId, companyId));
    const activeBudget = allBudgets.find(b => b.isActive) || allBudgets[0];

    if (!activeBudget) {
      return res.json({
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || new Date().toISOString(),
        items: [],
      });
    }

    const lines = await db.select().from(budgetLines).where(eq(budgetLines.budgetId, activeBudget.id));
    const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));

    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));
    const expenseByCat: Record<string, number> = {};
    for (const e of allExpenses) {
      expenseByCat[e.category] = (expenseByCat[e.category] || 0) + (e.amount || 0);
    }

    const items = lines.map(line => {
      const account = accountMap[line.accountId];
      const actual = expenseByCat[account?.name || ""] || 0;
      const budgeted = line.amount || 0;
      const variance = budgeted - actual;
      return {
        accountName: account?.name || "Unknown",
        budgeted,
        actual,
        variance,
        variancePercent: budgeted > 0 ? (variance / budgeted) * 100 : 0,
      };
    });

    res.json({
      startDate: activeBudget.startDate.toISOString(),
      endDate: activeBudget.endDate.toISOString(),
      items,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/general-ledger — Flat GL feed (existing, kept for fund-balance cards)
router.get("/general-ledger", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate, fundId: filterFundId } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const end = range.end;

    const glRaw = await db.execute(sql`
      SELECT
        g.id, g.date, g.source_type, g.transaction_id, g.journal_entry_id,
        g.account_id, g.account_code, g.account_name,
        g.fund_id, g.fund_name, g.entry_type, g.amount, g.description
      FROM gl_entries g
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${end}
        ${filterFundId && filterFundId !== "" ? sql`AND g.fund_id = ${filterFundId as string}` : sql``}
      ORDER BY g.date ASC, g.created_at ASC
    `);

    const entries = sqlRows(glRaw).map((r: any) => ({
      id: r.id,
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      sourceType: r.source_type,
      transactionId: r.transaction_id,
      journalEntryId: r.journal_entry_id,
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      fundId: r.fund_id ?? null,
      fundName: r.fund_name ?? null,
      entryType: r.entry_type,
      amount: parseFloat(r.amount) || 0,
      description: r.description ?? null,
    }));

    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

    const fundBalances: Record<string, any> = {};
    for (const e of entries) {
      const fid = e.fundId ?? "__unassigned__";
      if (!fundBalances[fid]) {
        const fundRecord = e.fundId ? fundMap[e.fundId] : null;
        fundBalances[fid] = {
          fundId: fid,
          fundName: e.fundName ?? (fid === "__unassigned__" ? "Unassigned" : "Unknown Fund"),
          fundType: fundRecord?.fundType ?? "UNRESTRICTED",
          netBalance: 0, totalCredits: 0, totalDebits: 0,
        };
      }
      if (e.entryType === "CREDIT") {
        fundBalances[fid].totalCredits += e.amount;
        fundBalances[fid].netBalance += e.amount;
      } else {
        fundBalances[fid].totalDebits += e.amount;
        fundBalances[fid].netBalance -= e.amount;
      }
    }

    res.json({
      startDate: range.startYmd,
      endDate: range.endYmd,
      entries,
      fundBalances: Object.values(fundBalances),
      totalEntries: entries.length,
    });
  } catch (error) {
    console.error("GL report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/gl-by-account — General Ledger grouped by account with running balances
router.get("/gl-by-account", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate, fundId: filterFundId } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    const fundFilter = filterFundId && filterFundId !== ""
      ? sql`AND g.fund_id = ${filterFundId as string}`
      : sql``;

    // ── Beginning balances (all GL before start date) ─────────────────────────
    const beginRows = await db.execute(sql`
      SELECT
        c.id              AS account_id,
        c.code            AS account_code,
        c.name            AS account_name,
        c.coa_type        AS account_type,
        c.sort_order      AS sort_order,
        ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
        ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
      FROM chart_of_accounts c
      JOIN gl_entries g
        ON g.account_id = c.id
        AND g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date < ${start}
        ${fundFilter}
      WHERE c.company_id = ${companyId}
        AND c.is_active = true
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
    `);

    // Beginning balance: debit-normal for ASSET/EXPENSE, credit-normal otherwise
    const beginMap: Record<string, { accountId: string; accountCode: string; accountName: string; coaType: string; sortOrder: number; beginBalance: number }> = {};
    for (const r of sqlRows(beginRows) as any[]) {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      const coaType = r.account_type as string;
      const beginBalance = (coaType === "ASSET" || coaType === "EXPENSE") ? debit - credit : credit - debit;
      beginMap[r.account_id] = {
        accountId: r.account_id, accountCode: r.account_code,
        accountName: r.account_name, coaType: r.account_type,
        sortOrder: r.sort_order, beginBalance,
      };
    }

    // ── Period entries ─────────────────────────────────────────────────────────
    const periodRows = await db.execute(sql`
      SELECT
        g.id, g.date, g.source_type, g.transaction_id, g.journal_entry_id,
        g.account_id, g.account_code, g.account_name,
        c.coa_type AS account_type, c.sort_order,
        g.fund_id, g.fund_name, g.entry_type, g.amount, g.description
      FROM gl_entries g
      JOIN chart_of_accounts c ON c.id = g.account_id AND c.company_id = ${companyId}
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
        ${fundFilter}
      ORDER BY c.sort_order, c.code, g.date ASC, g.created_at ASC
    `);

    // Group period entries by account
    const accountEntries: Record<string, any[]> = {};
    const accountMeta: Record<string, { accountId: string; accountCode: string; accountName: string; coaType: string; sortOrder: number }> = {};

    for (const r of sqlRows(periodRows) as any[]) {
      const aid = r.account_id as string;
      if (!accountEntries[aid]) accountEntries[aid] = [];
      if (!accountMeta[aid]) {
        accountMeta[aid] = {
          accountId: aid,
          accountCode: r.account_code,
          accountName: r.account_name,
          coaType: r.account_type,
          sortOrder: r.sort_order ?? 999,
        };
      }
      accountEntries[aid].push({
        id: r.id,
        date: r.date instanceof Date ? r.date.toISOString() : r.date,
        sourceType: r.source_type,
        transactionId: r.transaction_id ?? null,
        journalEntryId: r.journal_entry_id ?? null,
        fundId: r.fund_id ?? null,
        fundName: r.fund_name ?? null,
        entryType: r.entry_type,
        amount: parseFloat(r.amount) || 0,
        description: r.description ?? null,
      });
    }

    // Merge all accounts (begin + period)
    const allAccountIds = new Set([...Object.keys(beginMap), ...Object.keys(accountEntries)]);
    const glAccounts = Array.from(allAccountIds).map(aid => {
      const meta = accountMeta[aid] ?? beginMap[aid]!;
      const entries = accountEntries[aid] ?? [];
      const beginBalance = beginMap[aid]?.beginBalance ?? 0;

      const coaType = meta.coaType;
      let periodDebit = 0, periodCredit = 0;
      let runningBalance = beginBalance;

      const entriesWithRunning = entries.map(e => {
        if (e.entryType === "DEBIT") {
          periodDebit += e.amount;
          runningBalance += (coaType === "ASSET" || coaType === "EXPENSE") ? e.amount : -e.amount;
        } else {
          periodCredit += e.amount;
          runningBalance += (coaType === "ASSET" || coaType === "EXPENSE") ? -e.amount : e.amount;
        }
        return { ...e, runningBalance };
      });

      return {
        accountId: meta.accountId,
        accountCode: meta.accountCode,
        accountName: meta.accountName,
        coaType: meta.coaType,
        sortOrder: meta.sortOrder ?? 999,
        beginBalance,
        entries: entriesWithRunning,
        periodDebit,
        periodCredit,
        endBalance: runningBalance,
      };
    }).filter(a => a.beginBalance !== 0 || a.entries.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.accountCode.localeCompare(b.accountCode));

    res.json({
      startDate: range.startYmd,
      endDate: range.endYmd,
      accounts: glAccounts,
    });
  } catch (error) {
    console.error("GL by account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/general-journal — Chronological journal with grouped debit/credit splits
router.get("/general-journal", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate, fundId: filterFundId } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    const fundFilter = filterFundId && filterFundId !== ""
      ? sql`AND g.fund_id = ${filterFundId as string}`
      : sql``;

    // Pull all GL entries in the period, with reference info from transactions/journal_entries
    const gjRaw = await db.execute(sql`
      SELECT
        g.id, g.date, g.source_type,
        g.transaction_id, g.journal_entry_id,
        g.account_id, g.account_code, g.account_name,
        g.fund_id, g.fund_name, g.entry_type, g.amount, g.description,
        g.created_at,
        t.payee            AS tx_payee,
        t.memo             AS tx_memo,
        t.check_number     AS tx_check_number,
        je.description     AS je_description,
        je.reference_number AS je_reference
      FROM gl_entries g
      LEFT JOIN transactions t  ON t.id  = g.transaction_id
      LEFT JOIN journal_entries je ON je.id = g.journal_entry_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
        ${fundFilter}
      ORDER BY g.date ASC, g.transaction_id, g.journal_entry_id, g.created_at ASC
    `);

    // Group by (transaction_id | journal_entry_id) since each source maps to a balanced group
    const groups: Record<string, any> = {};
    const groupOrder: string[] = [];

    for (const r of sqlRows(gjRaw) as any[]) {
      const groupKey = (r.transaction_id ?? r.journal_entry_id ?? r.id) as string;
      if (!groups[groupKey]) {
        groupOrder.push(groupKey);
        const description =
          r.source_type === "TRANSACTION" ? (r.tx_payee || r.tx_memo || r.description || "Bank Transaction")
          : r.source_type === "OPENING_BALANCE" ? "Opening Balance"
          : (r.je_description || r.description || "Journal Entry");

        groups[groupKey] = {
          groupKey,
          date: r.date instanceof Date ? r.date.toISOString() : r.date,
          sourceType: r.source_type,
          referenceNumber: r.tx_check_number ?? r.je_reference ?? null,
          description,
          entries: [],
          totalDebits: 0,
          totalCredits: 0,
        };
      }
      const amt = parseFloat(r.amount) || 0;
      groups[groupKey].entries.push({
        id: r.id,
        accountCode: r.account_code,
        accountName: r.account_name,
        fundName: r.fund_name ?? null,
        entryType: r.entry_type,
        amount: amt,
        description: r.description ?? null,
      });
      if (r.entry_type === "DEBIT")  groups[groupKey].totalDebits  += amt;
      else                            groups[groupKey].totalCredits += amt;
    }

    res.json({
      startDate: range.startYmd,
      endDate: range.endYmd,
      groups: groupOrder.map(k => groups[k]),
      totalGroups: groupOrder.length,
    });
  } catch (error) {
    console.error("General journal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/transaction-register — Full searchable transaction feed from GL
router.get("/transaction-register", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate, search, minAmount, maxAmount, fundId: filterFundId } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    const fundFilter = filterFundId && filterFundId !== ""
      ? sql`AND g.fund_id = ${filterFundId as string}`
      : sql``;

    // Aggregate each source transaction into one register row (sum of DEBIT side = amount)
    const regRaw = await db.execute(sql`
      SELECT
        COALESCE(g.transaction_id, g.journal_entry_id, g.id) AS group_key,
        MIN(g.date)        AS date,
        g.source_type,
        MIN(CASE WHEN g.source_type = 'TRANSACTION' THEN t.payee END) AS payee,
        MIN(CASE WHEN g.source_type = 'TRANSACTION' THEN t.memo END)  AS memo,
        MIN(CASE WHEN g.source_type = 'TRANSACTION' THEN t.check_number END) AS check_number,
        MIN(je.description) AS je_description,
        MIN(g.fund_name)   AS fund_name,
        MIN(g.description) AS gl_description,
        -- Debit-side accounts for this group (comma-separated)
        STRING_AGG(DISTINCT CASE WHEN g.entry_type = 'DEBIT' THEN g.account_name END, ', ') AS debit_accounts,
        STRING_AGG(DISTINCT CASE WHEN g.entry_type = 'CREDIT' THEN g.account_name END, ', ') AS credit_accounts,
        SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END) AS total_debits,
        SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END) AS total_credits
      FROM gl_entries g
      LEFT JOIN transactions   t  ON t.id  = g.transaction_id
      LEFT JOIN journal_entries je ON je.id = g.journal_entry_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
        ${fundFilter}
      GROUP BY group_key, g.source_type
      ORDER BY MIN(g.date) DESC, group_key
    `);

    let txns = sqlRows(regRaw).map((r: any) => ({
      groupKey:      r.group_key as string,
      date:          r.date instanceof Date ? r.date.toISOString() : r.date,
      sourceType:    r.source_type as string,
      description:   (r.payee || r.je_description || r.memo || r.gl_description || (r.source_type === "OPENING_BALANCE" ? "Opening Balance" : "Transaction")) as string,
      memo:          (r.memo ?? r.je_description ?? null) as string | null,
      checkNumber:   (r.check_number ?? null) as string | null,
      fundName:      (r.fund_name ?? null) as string | null,
      debitAccounts:  (r.debit_accounts  ?? null) as string | null,
      creditAccounts: (r.credit_accounts ?? null) as string | null,
      totalDebits:   parseFloat(r.total_debits)  || 0,
      totalCredits:  parseFloat(r.total_credits) || 0,
      amount:        parseFloat(r.total_debits)  || 0, // display amount = debit side
    }));

    // Apply search filter
    if (search && (search as string).trim()) {
      const q = (search as string).toLowerCase();
      txns = txns.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.memo ?? "").toLowerCase().includes(q) ||
        (t.debitAccounts ?? "").toLowerCase().includes(q) ||
        (t.creditAccounts ?? "").toLowerCase().includes(q) ||
        (t.fundName ?? "").toLowerCase().includes(q) ||
        (t.checkNumber ?? "").toLowerCase().includes(q)
      );
    }
    if (minAmount) txns = txns.filter(t => t.amount >= parseFloat(minAmount as string));
    if (maxAmount) txns = txns.filter(t => t.amount <= parseFloat(maxAmount as string));

    res.json({
      startDate: range.startYmd,
      endDate: range.endYmd,
      transactions: txns,
      total: txns.length,
    });
  } catch (error) {
    console.error("Transaction register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 990 COMPLIANCE ENGINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map an expense account code to an IRS Form 990 / 990-EZ line number.
 * Falls back to "Line 16 — Other Expenses" when no rule matches.
 */
function irsLineForCode(code: string, name: string): { line: string; label: string } {
  const n = parseInt(code, 10);
  const lower = name.toLowerCase();

  // Keyword-first shortcuts (highest priority)
  if (/grant|award|scholarship|assistance/i.test(lower))
    return { line: "Line 10", label: "Grants and Similar Amounts Paid" };
  if (/benefit.*member|member.*benefit/i.test(lower))
    return { line: "Line 11", label: "Benefits Paid to Members" };
  if (/salary|salaries|wage|compensation|payroll|personnel/i.test(lower))
    return { line: "Line 12", label: "Salaries, Compensation & Employee Benefits" };
  if (/benefit|insurance|health|retirement|401k|pension/i.test(lower))
    return { line: "Line 12", label: "Salaries, Compensation & Employee Benefits" };
  if (/professional|accounting|audit|legal|consulting|contractor|fees/i.test(lower))
    return { line: "Line 13", label: "Professional Fees & Contract Services" };
  if (/occupancy|rent|utilities|electric|gas|water|maintenance|janitorial/i.test(lower))
    return { line: "Line 14", label: "Occupancy, Rent, Utilities & Maintenance" };
  if (/printing|publication|postage|shipping|mailing/i.test(lower))
    return { line: "Line 15", label: "Printing, Publications, Postage & Shipping" };

  // Code-range fallbacks
  if (n >= 8000 && n <= 8099) return { line: "Line 10", label: "Grants and Similar Amounts Paid" };
  if (n >= 8100 && n <= 8299) return { line: "Line 12", label: "Salaries, Compensation & Employee Benefits" };
  if (n >= 8300 && n <= 8499) return { line: "Line 13", label: "Professional Fees & Contract Services" };
  if (n >= 8500 && n <= 8599) return { line: "Line 14", label: "Occupancy, Rent, Utilities & Maintenance" };
  if (n >= 8600 && n <= 8699) return { line: "Line 15", label: "Printing, Publications, Postage & Shipping" };

  return { line: "Line 16", label: "Other Expenses" };
}

// ── GET /reports/990-readiness ─────────────────────────────────────────────
// Returns the readiness score (% of expense GL entries that have a
// functional_type tag) plus a list of untagged expense transactions.
router.get("/990-readiness", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    // All EXPENSE-side GL entries in the period (exclude bank/asset entries for the same tx)
    const expenseRows = await db.execute(sql`
      SELECT
        g.id,
        g.transaction_id,
        g.journal_entry_id,
        g.source_type,
        g.account_code,
        g.account_name,
        g.amount,
        g.date,
        g.functional_type,
        g.description,
        g.fund_name
      FROM gl_entries g
      JOIN chart_of_accounts c ON c.id = g.account_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND c.coa_type = 'EXPENSE'
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
      ORDER BY g.date DESC
    `);

    const rows = sqlRows(expenseRows) as any[];
    const total = rows.length;
    const tagged = rows.filter((r) => r.functional_type).length;
    const score = total === 0 ? 100 : Math.round((tagged / total) * 100);

    // Build the untagged list — group by transaction for a cleaner display
    const untagged = rows
      .filter((r) => !r.functional_type)
      .map((r) => ({
        glEntryId: r.id,
        transactionId: r.transaction_id,
        journalEntryId: r.journal_entry_id,
        sourceType: r.source_type,
        date: r.date instanceof Date ? r.date.toISOString() : r.date,
        description: r.description,
        accountCode: r.account_code,
        accountName: r.account_name,
        amount: parseFloat(r.amount),
        fundName: r.fund_name,
      }));

    res.json({
      score,
      total,
      tagged,
      untagged: untagged.length,
      untaggedItems: untagged,
      period: { startDate: range.startYmd, endDate: range.endYmd },
    });
  } catch (err) {
    console.error("990 readiness error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /reports/990-preparer ──────────────────────────────────────────────
// Returns expenses grouped by IRS line code with functional breakdown,
// plus the Public Support Test calculation.
router.get("/990-preparer", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    // ── Expense rows with functional breakdown ──────────────────────────────
    const expenseRows = await db.execute(sql`
      SELECT
        g.account_code,
        g.account_name,
        g.amount,
        g.functional_type
      FROM gl_entries g
      JOIN chart_of_accounts c ON c.id = g.account_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND c.coa_type = 'EXPENSE'
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
    `);

    // ── Income rows for Public Support Test ────────────────────────────────
    const incomeRows = await db.execute(sql`
      SELECT
        c.code AS account_code,
        c.name AS account_name,
        COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE -g.amount END), 0) AS net_amount
      FROM chart_of_accounts c
      LEFT JOIN gl_entries g
        ON g.account_id = c.id
        AND g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
      WHERE c.company_id = ${companyId}
        AND c.coa_type = 'INCOME'
        AND c.is_active = true
      GROUP BY c.code, c.name
    `);

    // Build IRS line groups
    const lineMap: Record<string, {
      line: string; label: string;
      programService: number; managementGeneral: number; fundraising: number; untagged: number; total: number;
      accounts: Record<string, { code: string; name: string; total: number }>;
    }> = {};

    for (const row of sqlRows(expenseRows) as any[]) {
      const { line, label } = irsLineForCode(String(row.account_code), String(row.account_name));
      if (!lineMap[line]) {
        lineMap[line] = { line, label, programService: 0, managementGeneral: 0, fundraising: 0, untagged: 0, total: 0, accounts: {} };
      }
      const amount = parseFloat(row.amount);
      lineMap[line].total += amount;
      if (row.functional_type === "PROGRAM_SERVICE")       lineMap[line].programService    += amount;
      else if (row.functional_type === "MANAGEMENT_GENERAL") lineMap[line].managementGeneral += amount;
      else if (row.functional_type === "FUNDRAISING")       lineMap[line].fundraising       += amount;
      else                                                   lineMap[line].untagged          += amount;

      // Per-account sub-detail
      const key = row.account_code;
      if (!lineMap[line].accounts[key]) {
        lineMap[line].accounts[key] = { code: row.account_code, name: row.account_name, total: 0 };
      }
      lineMap[line].accounts[key].total += amount;
    }

    // Convert to sorted array
    const irsLines = Object.values(lineMap)
      .sort((a, b) => a.line.localeCompare(b.line))
      .map((l) => ({ ...l, accounts: Object.values(l.accounts) }));

    const grandTotal = irsLines.reduce((s, l) => s + l.total, 0);
    const totalProgram = irsLines.reduce((s, l) => s + l.programService, 0);
    const totalMgmt    = irsLines.reduce((s, l) => s + l.managementGeneral, 0);
    const totalFundraising = irsLines.reduce((s, l) => s + l.fundraising, 0);

    // ── Public Support Test ────────────────────────────────────────────────
    // IRS 501(c)(3) public support = contributions, government grants
    // Test: publicSupport / totalRevenue >= 33.33%
    const allIncome = sqlRows(incomeRows) as any[];
    const totalRevenue = allIncome.reduce((s, r) => s + parseFloat(r.net_amount), 0);

    const publicSupportAccounts = allIncome.filter((r) =>
      /contribut|donat|grant|gift|pledge/i.test(String(r.account_name))
      || (parseInt(r.account_code, 10) >= 4000 && parseInt(r.account_code, 10) <= 4199)
    );
    const totalPublicSupport = publicSupportAccounts.reduce((s, r) => s + parseFloat(r.net_amount), 0);
    const publicSupportPct = totalRevenue > 0 ? (totalPublicSupport / totalRevenue) * 100 : 0;
    const passesPublicSupportTest = publicSupportPct >= 33.33;

    res.json({
      period: { startDate: range.startYmd, endDate: range.endYmd },
      irsLines,
      totals: {
        grandTotal,
        totalProgram,
        totalMgmt,
        totalFundraising,
      },
      publicSupportTest: {
        totalRevenue,
        totalPublicSupport,
        publicSupportPct: Math.round(publicSupportPct * 10) / 10,
        threshold: 33.33,
        passes: passesPublicSupportTest,
        publicSupportAccounts: publicSupportAccounts.map((r) => ({
          code: r.account_code,
          name: r.account_name,
          amount: parseFloat(r.net_amount),
        })),
      },
    });
  } catch (err) {
    console.error("990 preparer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /reports/990-export ────────────────────────────────────────────────
// Returns a CSV file formatted for 990 CPA preparation software.
router.get("/990-export", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const range = parseReportRange(startDate, endDate);
    if (!range.ok) return res.status(400).json({ error: range.error });
    const start = range.start;
    const endOfDay = range.end;

    const exportRaw = await db.execute(sql`
      SELECT
        g.date,
        g.description,
        g.account_code,
        g.account_name,
        g.fund_name,
        g.amount,
        g.entry_type,
        g.functional_type,
        g.source_type,
        c.coa_type AS account_type
      FROM gl_entries g
      JOIN chart_of_accounts c ON c.id = g.account_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date >= ${start}
        AND g.date <= ${endOfDay}
      ORDER BY g.date, g.account_code
    `);

    const irs = (code: string, name: string) => irsLineForCode(code, name).line;
    const functionalLabel: Record<string, string> = {
      PROGRAM_SERVICE: "Program Service",
      MANAGEMENT_GENERAL: "Management & General",
      FUNDRAISING: "Fundraising",
    };

    const lines: string[] = [
      [
        "Date",
        "Description",
        "Account Code",
        "Account Name",
        "Account Type",
        "Fund",
        "Entry Type",
        "Amount",
        "Functional Type (990)",
        "IRS 990 Line",
      ].join(","),
    ];

    for (const r of sqlRows(exportRaw) as any[]) {
      const row = [
        new Date(r.date).toISOString().substring(0, 10),
        `"${String(r.description ?? "").replace(/"/g, '""')}"`,
        r.account_code,
        `"${String(r.account_name).replace(/"/g, '""')}"`,
        r.account_type,
        `"${String(r.fund_name ?? "").replace(/"/g, '""')}"`,
        r.entry_type,
        parseFloat(r.amount).toFixed(2),
        functionalLabel[r.functional_type] ?? "",
        r.account_type === "EXPENSE" ? irs(String(r.account_code), String(r.account_name)) : "",
      ].join(",");
      lines.push(row);
    }

    const csv = lines.join("\r\n");
    const year = parseInt(range.startYmd.slice(0, 4), 10) || new Date().getUTCFullYear();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="990-export-${year}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("990 export error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
