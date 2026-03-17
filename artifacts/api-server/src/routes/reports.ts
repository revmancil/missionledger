import { Router } from "express";
import { db, accounts, journalEntries, journalEntryLines, donations, expenses, budgets, budgetLines } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

// GET /reports/profit-loss
router.get("/profit-loss", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    const filteredDonations = allDonations.filter(d => {
      const date = new Date(d.date);
      return date >= start && date <= end;
    });
    const filteredExpenses = allExpenses.filter(e => {
      const date = new Date(e.date);
      return date >= start && date <= end;
    });

    // Group revenue by category (type)
    const revenueMap: Record<string, number> = {};
    for (const d of filteredDonations) {
      const key = `Donations - ${d.type}`;
      revenueMap[key] = (revenueMap[key] || 0) + (d.amount || 0);
    }

    const expenseMap: Record<string, number> = {};
    for (const e of filteredExpenses) {
      expenseMap[e.category] = (expenseMap[e.category] || 0) + (e.amount || 0);
    }

    const totalRevenue = Object.values(revenueMap).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(expenseMap).reduce((s, v) => s + v, 0);

    res.json({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      revenue: Object.entries(revenueMap).map(([name, amount], i) => ({
        accountId: `rev-${i}`,
        accountCode: `4${String(i).padStart(3, "0")}`,
        accountName: name,
        amount,
        children: [],
      })),
      expenses: Object.entries(expenseMap).map(([name, amount], i) => ({
        accountId: `exp-${i}`,
        accountCode: `5${String(i).padStart(3, "0")}`,
        accountName: name,
        amount,
        children: [],
      })),
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/balance-sheet
router.get("/balance-sheet", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));

    const assetAccounts = allAccounts.filter(a => a.type === "ASSET");
    const liabilityAccounts = allAccounts.filter(a => a.type === "LIABILITY");
    const equityAccounts = allAccounts.filter(a => a.type === "EQUITY");

    const toLineItem = (acct: typeof allAccounts[0]) => ({
      accountId: acct.id,
      accountCode: acct.code,
      accountName: acct.name,
      amount: 0,
      children: [],
    });

    res.json({
      asOfDate: new Date().toISOString(),
      assets: assetAccounts.map(toLineItem),
      liabilities: liabilityAccounts.map(toLineItem),
      equity: equityAccounts.map(toLineItem),
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
    });
  } catch (error) {
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

export default router;
