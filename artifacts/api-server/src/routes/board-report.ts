import { Router } from "express";
import {
  db, bankAccounts, budgets, budgetLines, transactions, transactionSplits,
  programMetrics, strategicRisks, committeeUpdates,
} from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString, toIsoStringOrNull, asDate } from "../lib/safeIso";
import { parseBoardPeriodKind, parseBoardPeriodAnchor, resolveBoardPeriod, quarterForYmd, type BoardReportPeriod } from "../lib/boardReportPeriod";
import {
  buildHighLevelProfitLoss,
  buildHighLevelBalanceSheet,
  buildFundBalancesAsOf,
} from "../lib/boardReportFinancials";
import { bankRegisterBalanceAsOf } from "../lib/bankBalance";

const router = Router();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isAdminRole(role: string | undefined): boolean {
  return role === "ADMIN" || role === "MASTER_ADMIN";
}

function serializeMetric(row: typeof programMetrics.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    periodYear: row.periodYear,
    periodQuarter: row.periodQuarter,
    targetValue: row.targetValue ?? 0,
    actualValue: row.actualValue ?? 0,
    unit: row.unit,
    sortOrder: row.sortOrder,
    percentOfTarget: (row.targetValue ?? 0) > 0
      ? Math.round(((row.actualValue ?? 0) / (row.targetValue ?? 1)) * 100)
      : 0,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeRisk(row: typeof strategicRisks.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    description: row.description,
    status: row.status,
    ownerName: row.ownerName,
    reviewDate: toIsoStringOrNull(row.reviewDate),
    mitigation: row.mitigation,
    isActive: row.isActive,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function serializeCommittee(row: typeof committeeUpdates.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    committeeType: row.committeeType,
    title: row.title,
    body: row.body,
    meetingDate: toIsoStringOrNull(row.meetingDate),
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    isPublished: row.isPublished,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function buildFinancialHealth(
  companyId: string,
  period: BoardReportPeriod,
  plTotals: { totalRevenue: number; totalExpenses: number; netIncome: number },
) {
  const periodStart = period.start;
  const periodEnd = period.end;
  const monthsElapsed = Math.max(
    (periodEnd.getUTCFullYear() - periodStart.getUTCFullYear()) * 12
      + (periodEnd.getUTCMonth() - periodStart.getUTCMonth()) + 1,
    1,
  );

  const [bankRows, allTx, activeBudgetRows, budgetLineRows] = await Promise.all([
    db.select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      lastFour: bankAccounts.lastFour,
    }).from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isActive, true)))
      .orderBy(asc(bankAccounts.name)),
    db.select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      isVoid: transactions.isVoid,
      isSplit: transactions.isSplit,
      chartAccountId: transactions.chartAccountId,
      fundId: transactions.fundId,
    }).from(transactions).where(eq(transactions.companyId, companyId)),
    db.select().from(budgets)
      .where(and(eq(budgets.companyId, companyId), eq(budgets.isActive, true))),
    db.select({
      budgetId: budgetLines.budgetId,
      accountId: budgetLines.accountId,
      fundId: budgetLines.fundId,
      amount: budgetLines.amount,
    }).from(budgetLines).where(eq(budgetLines.companyId, companyId)),
  ]);

  const bankAccountsBreakdown = await Promise.all(
    bankRows.map(async (b) => ({
      id: b.id,
      name: b.name,
      lastFour: b.lastFour,
      balance: round2(await bankRegisterBalanceAsOf(b.id, companyId, periodEnd)),
    })),
  );
  bankAccountsBreakdown.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const totalCash = round2(bankAccountsBreakdown.reduce((s, b) => s + b.balance, 0));
  const activeTx = allTx.filter((t) => !t.isVoid);

  const periodRevenue = round2(plTotals.totalRevenue);
  const periodExpenses = round2(plTotals.totalExpenses);
  const periodNet = round2(plTotals.netIncome);
  const periodBurnRate = round2(periodExpenses / monthsElapsed);
  const monthsOfRunway = periodBurnRate > 0 ? round2(totalCash / periodBurnRate) : null;

  let budgetTotal = 0;
  let budgetActual = 0;
  let budgetPercent = 0;
  const budgetVsActual: Array<{ accountId: string; budgeted: number; actual: number; variance: number; percent: number }> = [];

  if (activeBudgetRows.length > 0) {
    const activeBudget = activeBudgetRows[0];
    const lines = budgetLineRows.filter((l) => l.budgetId === activeBudget.id);
    budgetTotal = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
    const budgetStart = asDate(activeBudget.startDate) ?? periodStart;
    const budgetEnd = asDate(activeBudget.endDate) ?? periodEnd;
    const rangeStart = budgetStart > periodStart ? budgetStart : periodStart;
    const rangeEnd = budgetEnd < periodEnd ? budgetEnd : periodEnd;

    const budgetTx = activeTx.filter((t) => {
      const d = asDate(t.date);
      return d && d >= rangeStart && d <= rangeEnd && t.type === "DEBIT";
    });

    const splitParents = budgetTx.filter((t) => t.isSplit).map((t) => t.id);
    let splits: typeof transactionSplits.$inferSelect[] = [];
    if (splitParents.length > 0) {
      splits = await db.select().from(transactionSplits)
        .where(and(
          eq(transactionSplits.companyId, companyId),
          inArray(transactionSplits.transactionId, splitParents),
        ));
    }

    const budgetLineKey = (accountId: string, fundId: string | null | undefined) =>
      `${accountId}::${fundId ?? ""}`;
    const budgetTxById = Object.fromEntries(budgetTx.map((t) => [t.id, t]));
    const actualByLine: Record<string, number> = {};
    for (const t of budgetTx) {
      if (!t.isSplit && t.chartAccountId) {
        const key = budgetLineKey(t.chartAccountId, t.fundId);
        actualByLine[key] = (actualByLine[key] ?? 0) + t.amount;
      }
    }
    for (const s of splits) {
      if (!s.chartAccountId) continue;
      const parent = budgetTxById[s.transactionId];
      const key = budgetLineKey(s.chartAccountId, s.fundId ?? parent?.fundId);
      actualByLine[key] = (actualByLine[key] ?? 0) + Math.abs(Number(s.amount));
    }

    budgetActual = round2(lines.reduce((s, line) => {
      const key = budgetLineKey(line.accountId, line.fundId);
      return s + (actualByLine[key] ?? 0);
    }, 0));
    budgetPercent = budgetTotal > 0 ? Math.round((budgetActual / budgetTotal) * 100) : 0;

    for (const line of lines.slice(0, 8)) {
      const budgeted = line.amount ?? 0;
      const actual = round2(actualByLine[budgetLineKey(line.accountId, line.fundId)] ?? 0);
      budgetVsActual.push({
        accountId: line.accountId,
        budgeted,
        actual,
        variance: round2(budgeted - actual),
        percent: budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0,
      });
    }
  }

  return {
    totalCash,
    cashAsOfDate: period.endYmd,
    bankAccounts: bankAccountsBreakdown,
    periodRevenue,
    periodExpenses,
    periodNet,
    periodBurnRate,
    monthsOfRunway,
    budget: {
      total: budgetTotal,
      actual: budgetActual,
      percent: budgetPercent,
      remaining: round2(budgetTotal - budgetActual),
    },
    budgetVsActual,
  };
}

function buildActionItems(input: {
  financial: Awaited<ReturnType<typeof buildFinancialHealth>>;
  risks: ReturnType<typeof serializeRisk>[];
  metrics: ReturnType<typeof serializeMetric>[];
}): Array<{
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  category: "financial" | "risk" | "program";
}> {
  const items: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    category: "financial" | "risk" | "program";
  }> = [];

  if (input.financial.budget.percent >= 100) {
    items.push({
      id: "budget-over",
      severity: "high",
      title: "Budget exceeded",
      description: `Period spending is at ${input.financial.budget.percent}% of the active annual budget.`,
      category: "financial",
    });
  } else if (input.financial.budget.percent >= 90) {
    items.push({
      id: "budget-warning",
      severity: "medium",
      title: "Budget nearly exhausted",
      description: `${input.financial.budget.percent}% of the annual budget has been used.`,
      category: "financial",
    });
  }

  if (input.financial.monthsOfRunway != null && input.financial.monthsOfRunway < 3) {
    items.push({
      id: "runway-low",
      severity: "high",
      title: "Low cash runway",
      description: `At the current burn rate, cash covers about ${input.financial.monthsOfRunway} month(s).`,
      category: "financial",
    });
  }

  const now = new Date();
  for (const risk of input.risks.filter((r) => r.isActive)) {
    if (risk.status === "RED") {
      items.push({
        id: `risk-${risk.id}`,
        severity: "high",
        title: risk.title,
        description: risk.description || "Strategic risk flagged red — board review recommended.",
        category: "risk",
      });
    } else if (risk.status === "YELLOW") {
      const reviewDue = risk.reviewDate ? asDate(risk.reviewDate) : null;
      if (reviewDue && reviewDue < now) {
        items.push({
          id: `risk-review-${risk.id}`,
          severity: "medium",
          title: `${risk.title} — review overdue`,
          description: risk.mitigation || "Risk review date has passed.",
          category: "risk",
        });
      }
    }
  }

  for (const m of input.metrics) {
    if (m.targetValue > 0 && m.percentOfTarget < 80) {
      items.push({
        id: `metric-${m.id}`,
        severity: m.percentOfTarget < 50 ? "high" : "medium",
        title: `${m.name} below target`,
        description: `Actual is ${m.percentOfTarget}% of the Q${m.periodQuarter} target.`,
        category: "program",
      });
    }
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ── GET /api/board-report — aggregated board dashboard ───────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { companyId, role, name, email } = user;
    const periodKind = parseBoardPeriodKind(req.query.period);
    const anchor = parseBoardPeriodAnchor(req.query);
    const reportPeriod = resolveBoardPeriod(periodKind, anchor);
    if (!reportPeriod) return res.status(400).json({ error: "Invalid period" });

    const { year, quarter } = quarterForYmd(reportPeriod.endYmd);
    const includeUnpublished = req.query.adminView === "true" && isAdminRole(role);

    const [metricRows, riskRows, committeeRows] = await Promise.all([
      db.select().from(programMetrics)
        .where(and(
          eq(programMetrics.companyId, companyId),
          eq(programMetrics.periodYear, year),
          eq(programMetrics.periodQuarter, quarter),
        ))
        .orderBy(asc(programMetrics.sortOrder), asc(programMetrics.name)),
      db.select().from(strategicRisks)
        .where(and(eq(strategicRisks.companyId, companyId), eq(strategicRisks.isActive, true)))
        .orderBy(desc(strategicRisks.updatedAt)),
      db.select().from(committeeUpdates)
        .where(eq(committeeUpdates.companyId, companyId))
        .orderBy(desc(committeeUpdates.meetingDate), desc(committeeUpdates.createdAt)),
    ]);

    const emptyProfitLoss = {
      startDate: reportPeriod.startYmd,
      endDate: reportPeriod.endYmd,
      totalRevenue: 0,
      totalExpenses: 0,
      netIncome: 0,
      topRevenue: [] as Array<{ accountCode: string; accountName: string; amount: number }>,
      topExpenses: [] as Array<{ accountCode: string; accountName: string; amount: number }>,
    };
    const emptyBalanceSheet = {
      asOfDate: reportPeriod.endYmd,
      totalAssets: 0,
      totalLiabilities: 0,
      totalNetAssets: 0,
      totalUnrestrictedNetAssets: 0,
      totalRestrictedNetAssets: 0,
      netIncome: 0,
      topAssets: [] as Array<{ accountCode: string; accountName: string; amount: number }>,
      topLiabilities: [] as Array<{ accountCode: string; accountName: string; amount: number }>,
    };

    const emptyFundBalances = {
      asOfDate: reportPeriod.endYmd,
      total: 0,
      items: [] as Array<{ fundId: string; fundName: string; fundType: string; balance: number }>,
    };

    let profitLoss = emptyProfitLoss;
    let balanceSheet = emptyBalanceSheet;
    let fundBalances = emptyFundBalances;
    try {
      [profitLoss, balanceSheet, fundBalances] = await Promise.all([
        buildHighLevelProfitLoss(companyId, reportPeriod.start, reportPeriod.end, reportPeriod.startYmd, reportPeriod.endYmd),
        buildHighLevelBalanceSheet(companyId, reportPeriod.end, reportPeriod.endYmd),
        buildFundBalancesAsOf(companyId, reportPeriod.end, reportPeriod.endYmd),
      ]);
    } catch (finErr) {
      console.error("GET /board-report financial summaries:", finErr);
    }

    let financial;
    try {
      financial = await buildFinancialHealth(companyId, reportPeriod, {
        totalRevenue: profitLoss.totalRevenue,
        totalExpenses: profitLoss.totalExpenses,
        netIncome: profitLoss.netIncome,
      });
    } catch (finErr) {
      console.error("GET /board-report financial health:", finErr);
      financial = {
        totalCash: 0,
        cashAsOfDate: reportPeriod.endYmd,
        bankAccounts: [] as Array<{ id: string; name: string; lastFour: string | null; balance: number }>,
        periodRevenue: profitLoss.totalRevenue,
        periodExpenses: profitLoss.totalExpenses,
        periodNet: profitLoss.netIncome,
        periodBurnRate: 0,
        monthsOfRunway: null as number | null,
        budget: { total: 0, actual: 0, percent: 0, remaining: 0 },
        budgetVsActual: [] as Array<{ accountId: string; budgeted: number; actual: number; variance: number; percent: number }>,
      };
    }

    const metrics = metricRows.map(serializeMetric);
    const risks = riskRows.map(serializeRisk);
    const committeeUpdatesFiltered = committeeRows
      .filter((c) => {
        const d = asDate(c.meetingDate) ?? asDate(c.createdAt);
        if (!d || d < reportPeriod.start || d > reportPeriod.end) return false;
        return includeUnpublished || c.isPublished;
      })
      .map(serializeCommittee);

    const actionRequired = buildActionItems({ financial, risks, metrics });

    res.json({
      generatedAt: new Date().toISOString(),
      dateRange: {
        kind: reportPeriod.kind,
        startDate: reportPeriod.startYmd,
        endDate: reportPeriod.endYmd,
        label: reportPeriod.label,
      },
      period: { year, quarter, label: `Q${quarter} ${year}` },
      profitLoss,
      balanceSheet,
      fundBalances,
      viewer: {
        role,
        isAdmin: isAdminRole(role),
        isBoardMember: role === "OFFICER",
        name: name ?? null,
        email: email ?? null,
      },
      actionRequired,
      financialHealth: financial,
      programmaticImpact: {
        period: { year, quarter },
        metrics,
        summary: metrics.length > 0
          ? {
              onTrack: metrics.filter((m) => m.percentOfTarget >= 100).length,
              atRisk: metrics.filter((m) => m.percentOfTarget > 0 && m.percentOfTarget < 80).length,
              total: metrics.length,
            }
          : null,
      },
      strategicRisks: {
        items: risks,
        counts: {
          green: risks.filter((r) => r.status === "GREEN").length,
          yellow: risks.filter((r) => r.status === "YELLOW").length,
          red: risks.filter((r) => r.status === "RED").length,
        },
      },
      committeeUpdates: committeeUpdatesFiltered,
    });
  } catch (err) {
    console.error("GET /board-report:", err instanceof Error ? err.message : err, err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Program metrics CRUD (admin) ────────────────────────────────────────────
router.post("/program-metrics", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, periodYear, periodQuarter, targetValue, actualValue, unit, sortOrder } = req.body ?? {};
    if (!name || periodYear == null || periodQuarter == null) {
      return res.status(400).json({ error: "name, periodYear, and periodQuarter are required" });
    }
    const [row] = await db.insert(programMetrics).values({
      companyId,
      name: String(name),
      description: description ?? null,
      periodYear: parseInt(periodYear),
      periodQuarter: parseInt(periodQuarter),
      targetValue: parseFloat(targetValue) || 0,
      actualValue: parseFloat(actualValue) || 0,
      unit: unit ?? null,
      sortOrder: parseInt(sortOrder) || 0,
    }).returning();
    res.status(201).json(serializeMetric(row));
  } catch (err) {
    console.error("POST /board-report/program-metrics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/program-metrics/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const body = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.periodYear !== undefined) updates.periodYear = parseInt(body.periodYear);
    if (body.periodQuarter !== undefined) updates.periodQuarter = parseInt(body.periodQuarter);
    if (body.targetValue !== undefined) updates.targetValue = parseFloat(body.targetValue) || 0;
    if (body.actualValue !== undefined) updates.actualValue = parseFloat(body.actualValue) || 0;
    if (body.unit !== undefined) updates.unit = body.unit;
    if (body.sortOrder !== undefined) updates.sortOrder = parseInt(body.sortOrder) || 0;

    const [row] = await db.update(programMetrics)
      .set(updates as any)
      .where(and(eq(programMetrics.id, req.params.id), eq(programMetrics.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(serializeMetric(row));
  } catch (err) {
    console.error("PUT /board-report/program-metrics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/program-metrics/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [row] = await db.delete(programMetrics)
      .where(and(eq(programMetrics.id, req.params.id), eq(programMetrics.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /board-report/program-metrics:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Strategic risks CRUD (admin) ──────────────────────────────────────────────
router.post("/strategic-risks", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { title, description, status, ownerName, reviewDate, mitigation } = req.body ?? {};
    if (!title) return res.status(400).json({ error: "title is required" });
    const [row] = await db.insert(strategicRisks).values({
      companyId,
      title: String(title),
      description: description ?? null,
      status: status ?? "GREEN",
      ownerName: ownerName ?? null,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      mitigation: mitigation ?? null,
    }).returning();
    res.status(201).json(serializeRisk(row));
  } catch (err) {
    console.error("POST /board-report/strategic-risks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/strategic-risks/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const body = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.ownerName !== undefined) updates.ownerName = body.ownerName;
    if (body.reviewDate !== undefined) updates.reviewDate = body.reviewDate ? new Date(body.reviewDate) : null;
    if (body.mitigation !== undefined) updates.mitigation = body.mitigation;
    if (body.isActive !== undefined) updates.isActive = !!body.isActive;

    const [row] = await db.update(strategicRisks)
      .set(updates as any)
      .where(and(eq(strategicRisks.id, req.params.id), eq(strategicRisks.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(serializeRisk(row));
  } catch (err) {
    console.error("PUT /board-report/strategic-risks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/strategic-risks/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [row] = await db.delete(strategicRisks)
      .where(and(eq(strategicRisks.id, req.params.id), eq(strategicRisks.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /board-report/strategic-risks:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Committee updates CRUD (admin) ────────────────────────────────────────────
router.post("/committee-updates", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, name, email } = (req as any).user;
    const { committeeType, title, body, meetingDate, isPublished } = req.body ?? {};
    if (!committeeType || !title || !body) {
      return res.status(400).json({ error: "committeeType, title, and body are required" });
    }
    const [row] = await db.insert(committeeUpdates).values({
      companyId,
      committeeType,
      title: String(title),
      body: String(body),
      meetingDate: meetingDate ? new Date(meetingDate) : null,
      authorName: name || email || "Admin",
      authorEmail: email ?? null,
      isPublished: !!isPublished,
    }).returning();
    res.status(201).json(serializeCommittee(row));
  } catch (err) {
    console.error("POST /board-report/committee-updates:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/committee-updates/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const body = req.body ?? {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.committeeType !== undefined) updates.committeeType = body.committeeType;
    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.meetingDate !== undefined) updates.meetingDate = body.meetingDate ? new Date(body.meetingDate) : null;
    if (body.isPublished !== undefined) updates.isPublished = !!body.isPublished;

    const [row] = await db.update(committeeUpdates)
      .set(updates as any)
      .where(and(eq(committeeUpdates.id, req.params.id), eq(committeeUpdates.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(serializeCommittee(row));
  } catch (err) {
    console.error("PUT /board-report/committee-updates:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/committee-updates/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [row] = await db.delete(committeeUpdates)
      .where(and(eq(committeeUpdates.id, req.params.id), eq(committeeUpdates.companyId, companyId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /board-report/committee-updates:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
