import { Router } from "express";
import {
  db, budgets, budgetLines, chartOfAccounts, transactions, transactionSplits,
} from "@workspace/db";
import { eq, and, desc, asc, gte, lte, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import {
  buildBudgetMonthPeriods,
  normalizeMonthlyAmounts,
  parseStoredMonthlyAmounts,
  roundMoney,
  sumMonthlyAmounts,
  utcMonthKey,
  type BudgetMonthPeriod,
} from "../lib/budgetMonths";

const router = Router();

function resolveLineMonthlyAmounts(
  stored: unknown,
  annualAmount: number,
  periods: BudgetMonthPeriod[],
): number[] {
  const parsed = parseStoredMonthlyAmounts(stored);
  if (parsed && parsed.length === periods.length) return parsed;
  return normalizeMonthlyAmounts(parsed, periods.length, annualAmount);
}

async function computeActualsByAccountMonth(
  companyId: string,
  start: Date,
  end: Date,
): Promise<Record<string, Record<string, number>>> {
  const txRows = await db.select().from(transactions)
    .where(and(
      eq(transactions.companyId, companyId),
      eq(transactions.type, "DEBIT"),
      eq(transactions.isVoid, false),
      gte(transactions.date, start),
      lte(transactions.date, end),
    ));

  const splitParentIds = txRows.filter((t) => t.isSplit).map((t) => t.id);
  let splitRows: typeof transactionSplits.$inferSelect[] = [];
  if (splitParentIds.length > 0) {
    splitRows = await db.select().from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, splitParentIds));
  }

  const txById = Object.fromEntries(txRows.map((t) => [t.id, t]));
  const out: Record<string, Record<string, number>> = {};

  const add = (accountId: string, monthKey: string, value: number) => {
    if (!out[accountId]) out[accountId] = {};
    out[accountId][monthKey] = roundMoney((out[accountId][monthKey] ?? 0) + value);
  };

  for (const t of txRows) {
    if (t.isSplit || !t.chartAccountId) continue;
    const mk = utcMonthKey(t.date);
    if (!mk) continue;
    add(t.chartAccountId, mk, Number(t.amount));
  }

  for (const s of splitRows) {
    if (!s.chartAccountId) continue;
    const parent = txById[s.transactionId];
    if (!parent) continue;
    const mk = utcMonthKey(parent.date);
    if (!mk) continue;
    add(s.chartAccountId, mk, Math.abs(Number(s.amount)));
  }

  return out;
}

function enrichBudgetLine(
  line: typeof budgetLines.$inferSelect,
  account: { id: string; code: string; name: string; type: string } | null,
  periods: BudgetMonthPeriod[],
  actualByMonth: Record<string, number>,
) {
  const monthlyAmounts = resolveLineMonthlyAmounts(line.monthlyAmounts, line.amount ?? 0, periods);
  const budgeted = sumMonthlyAmounts(monthlyAmounts);
  const monthlyActuals = periods.map((p) => roundMoney(actualByMonth[p.key] ?? 0));
  const actual = sumMonthlyAmounts(monthlyActuals);
  const remaining = roundMoney(budgeted - actual);
  const percent = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;

  return {
    id: line.id,
    budgetId: line.budgetId,
    accountId: line.accountId,
    amount: budgeted,
    monthlyAmounts,
    monthlyActuals,
    account: account ? { id: account.id, code: account.code, name: account.name, type: account.type } : null,
    actual,
    remaining,
    percent,
    overBudget: actual > budgeted && budgeted > 0,
  };
}

function serializeBudget(b: any) {
  return {
    ...b,
    startDate: b.startDate instanceof Date ? b.startDate.toISOString() : b.startDate,
    endDate: b.endDate instanceof Date ? b.endDate.toISOString() : b.endDate,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
  };
}

// ── GET /api/budgets — list all with totals ───────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(budgets)
      .where(eq(budgets.companyId, companyId))
      .orderBy(desc(budgets.fiscalYear));

    const allLines = await db.select().from(budgetLines)
      .where(eq(budgetLines.companyId, companyId));

    const enriched = all.map(b => {
      const lines = allLines.filter(l => l.budgetId === b.id);
      const totalBudget = lines.reduce((s, l) => s + (l.amount || 0), 0);
      return { ...serializeBudget(b), totalBudget, lineCount: lines.length };
    });

    res.json(enriched);
  } catch (err) {
    console.error("GET /budgets:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/budgets — create ────────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, fiscalYear, startDate, endDate, isActive } = req.body ?? {};
    if (!name || !fiscalYear || !startDate || !endDate)
      return res.status(400).json({ error: "Missing required fields" });

    if (isActive) {
      await db.update(budgets)
        .set({ isActive: false })
        .where(eq(budgets.companyId, companyId));
    }

    const [created] = await db.insert(budgets).values({
      companyId,
      name,
      fiscalYear: parseInt(fiscalYear),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive ?? false,
    }).returning();

    res.status(201).json({ ...serializeBudget(created), totalBudget: 0, lineCount: 0 });
  } catch (err) {
    console.error("POST /budgets:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/budgets/:id — update ─────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;
    const { name, fiscalYear, startDate, endDate, isActive } = req.body ?? {};

    if (isActive) {
      await db.update(budgets)
        .set({ isActive: false })
        .where(and(eq(budgets.companyId, companyId), eq(budgets.isActive, true)));
    }

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (fiscalYear !== undefined) updates.fiscalYear = parseInt(fiscalYear);
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = new Date(endDate);
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db.update(budgets)
      .set(updates)
      .where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Budget not found" });

    const lines = await db.select().from(budgetLines).where(eq(budgetLines.budgetId, id));
    const totalBudget = lines.reduce((s, l) => s + (l.amount || 0), 0);
    res.json({ ...serializeBudget(updated), totalBudget, lineCount: lines.length });
  } catch (err) {
    console.error("PUT /budgets/:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/budgets/:id ───────────────────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;

    await db.delete(budgetLines).where(eq(budgetLines.budgetId, id));
    const [deleted] = await db.delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Budget not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /budgets/:id:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/budgets/:id/lines — lines with actuals ──────────────────────────
router.get("/:id/lines", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;

    const [budget] = await db.select().from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const lines = await db.select().from(budgetLines)
      .where(eq(budgetLines.budgetId, id))
      .orderBy(asc(budgetLines.createdAt));

    const allCoa = await db.select().from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));
    const coaMap = Object.fromEntries(allCoa.map(c => [c.id, c]));

    const start = budget.startDate;
    const end = budget.endDate;
    const periods = buildBudgetMonthPeriods(budget.startDate, budget.endDate);
    const actualByAccountMonth = await computeActualsByAccountMonth(companyId, start, end);

    const enriched = lines.map((l) => {
      const account = coaMap[l.accountId] ?? null;
      return enrichBudgetLine(l, account, periods, actualByAccountMonth[l.accountId] ?? {});
    });

    res.json({
      months: periods.map((p) => ({ key: p.key, label: p.label })),
      lines: enriched,
    });
  } catch (err) {
    console.error("GET /budgets/:id/lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/budgets/:id/lines — add a line ──────────────────────────────────
router.post("/:id/lines", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;
    const { accountId, amount, monthlyAmounts } = req.body ?? {};
    if (!accountId || (amount === undefined && monthlyAmounts === undefined))
      return res.status(400).json({ error: "accountId and monthlyAmounts (or amount) required" });

    const [budget] = await db.select().from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.companyId, companyId)));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const existing = await db.select().from(budgetLines)
      .where(and(eq(budgetLines.budgetId, id), eq(budgetLines.accountId, accountId)));
    if (existing.length > 0)
      return res.status(409).json({ error: "This account already has a budget line" });

    const periods = buildBudgetMonthPeriods(budget.startDate, budget.endDate);
    const normalizedMonthly = monthlyAmounts !== undefined
      ? normalizeMonthlyAmounts(monthlyAmounts, periods.length)
      : normalizeMonthlyAmounts(null, periods.length, parseFloat(amount) || 0);
    const totalAmount = sumMonthlyAmounts(normalizedMonthly);

    const [line] = await db.insert(budgetLines).values({
      budgetId: id,
      companyId,
      accountId,
      amount: totalAmount,
      monthlyAmounts: normalizedMonthly,
    }).returning();

    const [account] = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, accountId));
    res.status(201).json(
      enrichBudgetLine(line, account ?? null, periods, {}),
    );
  } catch (err) {
    console.error("POST /budgets/:id/lines:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/budgets/:id/lines/:lineId — update amount ───────────────────────
router.put("/:id/lines/:lineId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { lineId } = req.params;
    const { amount, monthlyAmounts } = req.body ?? {};
    if (amount === undefined && monthlyAmounts === undefined) {
      return res.status(400).json({ error: "monthlyAmounts (or amount) required" });
    }

    const [existing] = await db.select().from(budgetLines)
      .where(and(eq(budgetLines.id, lineId), eq(budgetLines.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Line not found" });

    const [budget] = await db.select().from(budgets)
      .where(and(eq(budgets.id, existing.budgetId), eq(budgets.companyId, companyId)));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const periods = buildBudgetMonthPeriods(budget.startDate, budget.endDate);
    const normalizedMonthly = monthlyAmounts !== undefined
      ? normalizeMonthlyAmounts(monthlyAmounts, periods.length)
      : normalizeMonthlyAmounts(null, periods.length, parseFloat(amount) || 0);
    const totalAmount = sumMonthlyAmounts(normalizedMonthly);

    const [updated] = await db.update(budgetLines)
      .set({ amount: totalAmount, monthlyAmounts: normalizedMonthly, updatedAt: new Date() })
      .where(and(eq(budgetLines.id, lineId), eq(budgetLines.companyId, companyId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Line not found" });
    res.json(updated);
  } catch (err) {
    console.error("PUT /budgets/:id/lines/:lineId:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/budgets/:id/lines/:lineId ─────────────────────────────────────
router.delete("/:id/lines/:lineId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { lineId } = req.params;

    const [deleted] = await db.delete(budgetLines)
      .where(and(eq(budgetLines.id, lineId), eq(budgetLines.companyId, companyId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Line not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /budgets/:id/lines/:lineId:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
