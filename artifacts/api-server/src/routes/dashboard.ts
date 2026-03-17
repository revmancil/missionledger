import { Router } from "express";
import { db, donations, expenses, bankTransactions, journalEntries, journalEntryLines, accounts } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const companyId = user.companyId;

    // Get all donations and expenses
    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    const totalDonations = allDonations.reduce((s, d) => s + (d.amount || 0), 0);
    const totalExpenses = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    // Transaction count
    const allTransactions = await db.select().from(bankTransactions).where(eq(bankTransactions.companyId, companyId));
    const transactionCount = allTransactions.length;

    // Monthly data - last 12 months
    const now = new Date();
    const monthlyMap: Record<string, { donations: number; expenses: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap[key] = { donations: 0, expenses: 0 };
    }

    for (const d of allDonations) {
      const date = new Date(d.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key]) monthlyMap[key].donations += d.amount || 0;
    }
    for (const e of allExpenses) {
      const date = new Date(e.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[key]) monthlyMap[key].expenses += e.amount || 0;
    }

    const monthlyData = Object.entries(monthlyMap).map(([month, data]) => ({
      month,
      ...data,
    }));

    // Expense by category
    const categoryMap: Record<string, number> = {};
    for (const e of allExpenses) {
      categoryMap[e.category] = (categoryMap[e.category] || 0) + (e.amount || 0);
    }
    const expenseByCategory = Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Recent donations (last 5)
    const recentDonations = allDonations
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
      .map(d => ({
        id: d.id,
        donorName: d.donorName,
        amount: d.amount,
        date: d.date.toISOString(),
        type: d.type,
      }));

    // Recent expenses (last 5)
    const recentExpenses = allExpenses
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        date: e.date.toISOString(),
        category: e.category,
      }));

    res.json({
      totalDonations,
      totalExpenses,
      netIncome: totalDonations - totalExpenses,
      transactionCount,
      monthlyData,
      expenseByCategory,
      recentDonations,
      recentExpenses,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
