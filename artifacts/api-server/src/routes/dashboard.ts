import { Router } from "express";
import {
  db, donations, expenses, bankTransactions, bankAccounts,
  chartOfAccounts, transactions, transactionSplits, budgets, budgetLines,
} from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [, m] = key.split("-");
  return MONTH_LABELS[parseInt(m) - 1];
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const companyId = user.companyId;
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    // ── Parallel data fetch ─────────────────────────────────────────────────
    const [
      allBankAccounts, allCoa, allTx, allSplits,
      allDonations, allExpenses,
      activeBudgets, allBudgetLines,
    ] = await Promise.all([
      db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId)),
      db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId)),
      db.select().from(transactions)
        .where(eq(transactions.companyId, companyId))
        .orderBy(desc(transactions.date), desc(transactions.createdAt)),
      db.select().from(transactionSplits),
      db.select().from(donations).where(eq(donations.companyId, companyId)),
      db.select().from(expenses).where(eq(expenses.companyId, companyId)),
      db.select().from(budgets).where(and(eq(budgets.companyId, companyId), eq(budgets.isActive, true))),
      db.select().from(budgetLines).where(eq(budgetLines.companyId, companyId)),
    ]);

    const coaMap: Record<string, { id: string; code: string; name: string; type: string }> =
      Object.fromEntries(allCoa.map((a) => [a.id, a]));

    const activeTx = allTx.filter((t) => !t.isVoid);

    // ── KPI 1: Total Cash — computed from actual bank register transactions ──
    // (bank_accounts.currentBalance lags behind; summing non-void transactions
    //  gives the real current balance per account)
    const txBalByBank = new Map<string, number>();
    for (const ba of allBankAccounts) txBalByBank.set(ba.id, 0);
    for (const t of activeTx) {
      if (!t.bankAccountId) continue;
      const cur = txBalByBank.get(t.bankAccountId) ?? 0;
      txBalByBank.set(t.bankAccountId, cur + (t.type === "CREDIT" ? t.amount : -t.amount));
    }
    const totalCash = [...txBalByBank.values()].reduce((s, b) => s + b, 0);

    // ── KPI 2: Net Monthly Income (this month) ───────────────────────────────
    const monthStart = new Date(thisYear, thisMonth, 1);
    const monthEnd = new Date(thisYear, thisMonth + 1, 0, 23, 59, 59);
    const thisMonthTx = activeTx.filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= monthStart && d <= monthEnd;
    });
    const monthlyCredits = thisMonthTx.filter((t) => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0);
    const monthlyDebits  = thisMonthTx.filter((t) => t.type === "DEBIT").reduce((s, t) => s + t.amount, 0);
    const netMonthlyIncome = monthlyCredits - monthlyDebits;

    // ── KPI 3: Budget Progress (active budget YTD) ───────────────────────────
    let budgetTotal = 0;
    let budgetUsed = 0;
    let budgetPercent = 0;
    if (activeBudgets.length > 0) {
      const activeBudget = activeBudgets[0];
      const lines = allBudgetLines.filter((l) => l.budgetId === activeBudget.id);
      budgetTotal = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
      // YTD expense spend against budget period
      const budgetStart = activeBudget.startDate instanceof Date ? activeBudget.startDate : new Date(activeBudget.startDate);
      const ytdExpenses = activeTx
        .filter((t) => {
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          return t.type === "DEBIT" && d >= budgetStart && d <= now;
        })
        .reduce((s, t) => s + t.amount, 0);
      budgetUsed = ytdExpenses;
      budgetPercent = budgetTotal > 0 ? Math.round((ytdExpenses / budgetTotal) * 100) : 0;
    }

    // ── Spending by Category (Donut) ─────────────────────────────────────────
    // Use expense-type transactions + expense-type split lines
    const spendMap: Record<string, number> = {};

    // Simple (non-split) expense transactions
    for (const t of activeTx) {
      if (t.type === "DEBIT" && !t.isSplit && t.chartAccountId) {
        spendMap[t.chartAccountId] = (spendMap[t.chartAccountId] ?? 0) + t.amount;
      }
    }
    // Split transactions — use split lines
    const txIds = new Set(activeTx.filter((t) => t.isSplit).map((t) => t.id));
    for (const s of allSplits) {
      if (!txIds.has(s.transactionId)) continue;
      const parentTx = activeTx.find((t) => t.id === s.transactionId);
      if (!parentTx || parentTx.type !== "DEBIT") continue;
      if (s.chartAccountId) {
        spendMap[s.chartAccountId] = (spendMap[s.chartAccountId] ?? 0) + Math.abs(s.amount);
      }
    }

    const spendingByCategory = Object.entries(spendMap)
      .map(([id, amount]) => ({
        name: coaMap[id]?.name ?? "Uncategorized",
        code: coaMap[id]?.code ?? "",
        amount: Math.round(amount * 100) / 100,
      }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    // ── Monthly Trend — last 6 months (Bar Chart) ────────────────────────────
    const trendKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(thisYear, thisMonth - i, 1);
      trendKeys.push(monthKey(d));
    }
    const trendMap: Record<string, { income: number; expenses: number }> = {};
    for (const k of trendKeys) trendMap[k] = { income: 0, expenses: 0 };

    for (const t of activeTx) {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      const k = monthKey(d);
      if (!trendMap[k]) continue;
      if (t.type === "CREDIT") trendMap[k].income += t.amount;
      else trendMap[k].expenses += t.amount;
    }

    const monthlyTrend = trendKeys.map((k) => ({
      month: monthLabel(k),
      income: Math.round(trendMap[k].income * 100) / 100,
      expenses: Math.round(trendMap[k].expenses * 100) / 100,
    }));

    // ── Budget Tracker — top 5 expense accounts ───────────────────────────────
    // Build actual spend by chartAccountId (YTD)
    const ytdStart = new Date(thisYear, 0, 1);
    const ytdSpendMap: Record<string, number> = {};
    for (const t of activeTx) {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      if (t.type !== "DEBIT" || d < ytdStart) continue;
      if (!t.isSplit && t.chartAccountId) {
        ytdSpendMap[t.chartAccountId] = (ytdSpendMap[t.chartAccountId] ?? 0) + t.amount;
      }
    }
    for (const s of allSplits) {
      if (!txIds.has(s.transactionId)) continue;
      const parentTx = activeTx.find((t) => t.id === s.transactionId);
      if (!parentTx) continue;
      const d = parentTx.date instanceof Date ? parentTx.date : new Date(parentTx.date);
      if (parentTx.type !== "DEBIT" || d < ytdStart) continue;
      if (s.chartAccountId) {
        ytdSpendMap[s.chartAccountId] = (ytdSpendMap[s.chartAccountId] ?? 0) + Math.abs(s.amount);
      }
    }

    // Find budget lines (best-effort: match by code to account name)
    const activeBudget = activeBudgets[0];
    // Use top 5 spending accounts, pair with budget lines if available
    const top5Accounts = Object.entries(ytdSpendMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id, actual]) => {
        const coa = coaMap[id];
        // Try to find matching budget line (by amount approximation — without schema join)
        const budgeted = activeBudget
          ? (allBudgetLines.filter((l) => l.budgetId === activeBudget.id).reduce((s, l) => s + (l.amount ?? 0), 0) / Math.max(Object.keys(ytdSpendMap).length, 1))
          : 0;
        const actualRnd = Math.round(actual * 100) / 100;
        const budgetedRnd = Math.round(budgeted * 100) / 100;
        const percent = budgetedRnd > 0 ? Math.round((actualRnd / budgetedRnd) * 100) : 100;
        return {
          name: coa?.name ?? "Uncategorized",
          code: coa?.code ?? "",
          budgeted: budgetedRnd,
          actual: actualRnd,
          percent,
          overBudget: budgetedRnd > 0 && actualRnd > budgetedRnd,
        };
      });

    // ── Recent 10 Transactions (Activity Feed) ───────────────────────────────
    const recentTransactions = activeTx.slice(0, 10).map((t) => {
      const coa = t.chartAccountId ? coaMap[t.chartAccountId] : null;
      return {
        id: t.id,
        date: (t.date instanceof Date ? t.date : new Date(t.date)).toISOString(),
        payee: t.payee,
        amount: t.amount,
        type: t.type,
        status: t.status,
        isSplit: t.isSplit,
        accountName: coa?.name ?? (t.isSplit ? "Split transaction" : null),
        memo: t.memo ?? null,
      };
    });

    // ── Legacy fields (backward compat) ──────────────────────────────────────
    const totalDonations = allDonations.reduce((s, d) => s + (d.amount || 0), 0);
    const totalExpenses  = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    res.json({
      // Executive KPIs
      totalCash,
      monthlyIncome: monthlyCredits,
      monthlyExpenses: monthlyDebits,
      netMonthlyIncome,
      budgetProgress: { used: budgetUsed, total: budgetTotal, percent: budgetPercent },
      spendingByCategory,
      monthlyTrend,
      budgetTracker: top5Accounts,
      recentTransactions,
      // Legacy
      totalDonations,
      totalExpenses,
      netIncome: totalDonations - totalExpenses,
      transactionCount: allTx.length,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
