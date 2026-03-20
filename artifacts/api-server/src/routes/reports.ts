import { Router } from "express";
import { db, accounts, chartOfAccounts, journalEntries, journalEntryLines, donations, expenses, budgets, budgetLines, glEntries, funds } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// GET /reports/profit-loss  — Statement of Activities from GL entries
router.get("/profit-loss", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end   = endDate   ? new Date(endDate   as string) : new Date();
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    const glRows = await db.execute(sql`
      SELECT
        c.id        AS account_id,
        c.code      AS account_code,
        c.name      AS account_name,
        c.coa_type  AS account_type,
        c.sort_order AS sort_order,
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS total_credit
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

    const rows = (glRows.rows as any[]).map((r) => {
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
      startDate: start.toISOString(),
      endDate:   endOfDay.toISOString(),
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
    const { asOfDate } = req.query;

    const asOf = asOfDate ? new Date(asOfDate as string) : new Date();
    const asOfEnd = new Date(asOf);
    asOfEnd.setHours(23, 59, 59, 999);

    // ── 1. Asset & Liability rows (no fund split needed) ──────────────────────
    const assetLiabRows = await db.execute(sql`
      SELECT
        c.id              AS account_id,
        c.code            AS account_code,
        c.name            AS account_name,
        c.coa_type        AS account_type,
        c.sort_order      AS sort_order,
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS total_credit
      FROM chart_of_accounts c
      LEFT JOIN gl_entries g
        ON g.account_id = c.id
        AND g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date <= ${asOfEnd}
      WHERE c.company_id = ${companyId}
        AND c.is_active = true
        AND c.coa_type IN ('ASSET', 'LIABILITY')
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
      ORDER BY c.sort_order, c.code
    `);

    // ── 2. Net Assets split by fund type (EQUITY + INCOME/EXPENSE by fund) ───
    // Join GL entries with funds table to get the fund_type for each entry.
    // UNRESTRICTED fund_type = 'UNRESTRICTED'
    // Everything else = restricted (RESTRICTED_TEMP, RESTRICTED_PERM, BOARD_DESIGNATED)
    const netAssetRows = await db.execute(sql`
      SELECT
        c.id              AS account_id,
        c.code            AS account_code,
        c.name            AS account_name,
        c.coa_type        AS account_type,
        c.sort_order      AS sort_order,
        COALESCE(f.fund_type, 'UNRESTRICTED') AS fund_type,
        COALESCE(f.name, 'General') AS fund_name,
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS total_credit
      FROM chart_of_accounts c
      LEFT JOIN gl_entries g
        ON g.account_id = c.id
        AND g.company_id = ${companyId}
        AND g.is_void = false
        AND g.date <= ${asOfEnd}
      LEFT JOIN funds f ON f.id = g.fund_id AND f.company_id = ${companyId}
      WHERE c.company_id = ${companyId}
        AND c.is_active = true
        AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order, f.fund_type, f.name
      ORDER BY c.sort_order, c.code
    `);

    // Map asset/liability rows
    const assetLiabMapped = (assetLiabRows.rows as any[]).map((r) => {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      const amount = r.account_type === "ASSET" ? debit - credit : credit - debit;
      return { accountId: r.account_id, accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type, amount };
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

    for (const r of netAssetRows.rows as any[]) {
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

    res.json({
      asOfDate: asOfEnd.toISOString(),
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
      // Legacy fields kept for compatibility
      equity: [],
      totalEquity: totalUnrestrictedNetAssets,
      // Balance check
      difference: totalAssets - (totalLiabilities + totalNetAssets),
    });
  } catch (error) {
    console.error("Balance sheet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/cash-flow
router.get("/cash-flow", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    const filteredDonations = allDonations.filter(d => new Date(d.date) >= start && new Date(d.date) <= end);
    const filteredExpenses = allExpenses.filter(e => new Date(e.date) >= start && new Date(e.date) <= end);

    const totalRevenue = filteredDonations.reduce((s, d) => s + (d.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    res.json({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
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

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const rows = await db.execute(sql`
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

    const entries = (rows.rows as any[]).map(r => ({
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
      startDate: start.toISOString(),
      endDate: end.toISOString(),
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

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end   = endDate   ? new Date(endDate   as string) : new Date();
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

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
        COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0) AS total_credit
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
    for (const r of beginRows.rows as any[]) {
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

    for (const r of periodRows.rows as any[]) {
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
      startDate: start.toISOString(),
      endDate: endOfDay.toISOString(),
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

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end   = endDate   ? new Date(endDate   as string) : new Date();
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    const fundFilter = filterFundId && filterFundId !== ""
      ? sql`AND g.fund_id = ${filterFundId as string}`
      : sql``;

    // Pull all GL entries in the period, with reference info from transactions/journal_entries
    const rows = await db.execute(sql`
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

    for (const r of rows.rows as any[]) {
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
      startDate: start.toISOString(),
      endDate: endOfDay.toISOString(),
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

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end   = endDate   ? new Date(endDate   as string) : new Date();
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    const fundFilter = filterFundId && filterFundId !== ""
      ? sql`AND g.fund_id = ${filterFundId as string}`
      : sql``;

    // Aggregate each source transaction into one register row (sum of DEBIT side = amount)
    const rows = await db.execute(sql`
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

    let txns = (rows.rows as any[]).map(r => ({
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
      startDate: start.toISOString(),
      endDate: endOfDay.toISOString(),
      transactions: txns,
      total: txns.length,
    });
  } catch (error) {
    console.error("Transaction register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
