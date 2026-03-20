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
    // Include full end day
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
      // INCOME: credit-normal; EXPENSE: debit-normal
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

// GET /reports/balance-sheet  — Statement of Financial Position
router.get("/balance-sheet", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { asOfDate } = req.query;

    const asOf = asOfDate ? new Date(asOfDate as string) : new Date();
    // Include the full as-of day
    const asOfEnd = new Date(asOf);
    asOfEnd.setHours(23, 59, 59, 999);

    // Fetch ALL account types so we can roll revenue/expenses into Net Assets
    const glRows = await db.execute(sql`
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
        AND c.coa_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')
      GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
      ORDER BY c.sort_order, c.code
    `);

    const rows = (glRows.rows as any[]).map((r) => {
      const debit  = parseFloat(r.total_debit)  || 0;
      const credit = parseFloat(r.total_credit) || 0;
      // Normal balance convention
      // ASSET, EXPENSE: debit-normal  (positive = debit > credit)
      // LIABILITY, EQUITY, INCOME: credit-normal (positive = credit > debit)
      const amount =
        r.account_type === "ASSET" || r.account_type === "EXPENSE"
          ? debit - credit
          : credit - debit;
      return {
        accountId:   r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        amount,
        children: [],
      };
    });

    const assets      = rows.filter(r => r.accountType === "ASSET"     && r.amount !== 0);
    const liabilities = rows.filter(r => r.accountType === "LIABILITY" && r.amount !== 0);
    const equity      = rows.filter(r => r.accountType === "EQUITY"    && r.amount !== 0);
    // INCOME/EXPENSE accounts roll up into net income, which is added to Net Assets
    const incomeRows  = rows.filter(r => r.accountType === "INCOME"    && r.amount !== 0);
    const expenseRows = rows.filter(r => r.accountType === "EXPENSE"   && r.amount !== 0);

    const totalAssets      = assets.reduce((s, r) => s + r.amount, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
    const totalEquity      = equity.reduce((s, r) => s + r.amount, 0);
    const totalIncome      = incomeRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses    = expenseRows.reduce((s, r) => s + r.amount, 0);
    // Current period net income is the change in net assets not yet closed to equity
    const netIncome        = totalIncome - totalExpenses;
    // Total Net Assets = permanent equity accounts + current period net income
    const totalNetAssets   = totalEquity + netIncome;

    res.json({
      asOfDate:        asOfEnd.toISOString(),
      assets,
      liabilities,
      equity,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalNetAssets,
      // Balance check: should be 0 if books are in balance
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

// GET /reports/general-ledger
// Returns all non-voided GL entries with fund info, date-filtered.
// Also computes per-fund running balances.
router.get("/general-ledger", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate, fundId: filterFundId } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Pull all non-voided GL entries in the date window
    const rows = await db.execute(sql`
      SELECT
        g.id,
        g.date,
        g.source_type,
        g.transaction_id,
        g.journal_entry_id,
        g.account_id,
        g.account_code,
        g.account_name,
        g.fund_id,
        g.fund_name,
        g.entry_type,
        g.amount,
        g.description
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

    // ── Per-fund running balances ─────────────────────────────────────────────
    // For each fund, track net cash flow: income (CREDIT on income accts) minus
    // expenses (DEBIT on expense accts). We use a simple net approach:
    // CREDIT entries add to fund balance; DEBIT entries reduce it.
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

    const fundBalances: Record<string, { fundId: string; fundName: string; fundType: string; netBalance: number; totalCredits: number; totalDebits: number }> = {};

    for (const e of entries) {
      const fid = e.fundId ?? "__unassigned__";
      if (!fundBalances[fid]) {
        const fundRecord = e.fundId ? fundMap[e.fundId] : null;
        fundBalances[fid] = {
          fundId: fid,
          fundName: e.fundName ?? (fid === "__unassigned__" ? "Unassigned" : "Unknown Fund"),
          fundType: fundRecord?.fundType ?? "UNRESTRICTED",
          netBalance: 0,
          totalCredits: 0,
          totalDebits: 0,
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

export default router;
