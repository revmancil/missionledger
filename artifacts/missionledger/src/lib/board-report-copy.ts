/**
 * Plain-language copy and derived "what this means" summaries for the Board
 * Member Report. Kept framework-free (no React) so the same logic powers both
 * the on-screen page and the exported PDF, keeping the two views consistent.
 *
 * Tone is intentionally strictly factual — no subjective judgments like
 * "healthy" or "strong". Every sentence is a statement of what the numbers
 * actually show.
 */

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** "a surplus of $1,200" / "a deficit of $1,200" / "breaking even" */
export function surplusPhrase(net: number): string {
  if (net > 0) return `a surplus of ${formatCurrency(net)}`;
  if (net < 0) return `a deficit of ${formatCurrency(-net)}`;
  return "breaking even";
}

export interface PlainSummaryInput {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

/** "What this means" for the Revenue & Spending section. */
export function revenueSpendingSummary(p: PlainSummaryInput): string {
  if (p.totalRevenue === 0 && p.totalExpenses === 0) {
    return "No revenue or expenses were recorded for this period.";
  }
  const base = `This period the organization received ${formatCurrency(p.totalRevenue)} in revenue and spent ${formatCurrency(p.totalExpenses)}, `;
  if (p.netIncome > 0) return `${base}ending with ${surplusPhrase(p.netIncome)}.`;
  if (p.netIncome < 0) return `${base}ending with ${surplusPhrase(p.netIncome)}.`;
  return `${base}breaking even.`;
}

export interface PositionSummaryInput {
  totalAssets: number;
  totalLiabilities: number;
  totalNetAssets: number;
}

/** "What this means" for the What We Own & Owe section. */
export function positionSummary(p: PositionSummaryInput): string {
  return `At the end of the period the organization held ${formatCurrency(p.totalAssets)} in total assets against ${formatCurrency(p.totalLiabilities)} in total liabilities, leaving ${formatCurrency(p.totalNetAssets)} in net assets.`;
}

export interface HealthSummaryInput {
  totalCash: number;
  monthsOfRunway: number | null;
  budget: { percent: number };
}

/** "What this means" for the Cash & Sustainability section. */
export function healthSummary(p: HealthSummaryInput): string {
  const parts = [`Cash on hand totals ${formatCurrency(p.totalCash)}.`];
  if (p.monthsOfRunway != null) {
    parts.push(`At the current rate of spending, that covers about ${p.monthsOfRunway} month${p.monthsOfRunway === 1 ? "" : "s"} of operations.`);
  } else {
    parts.push("A cash runway estimate is not available because no average spending rate could be calculated.");
  }
  parts.push(`${p.budget.percent}% of the annual budget has been used.`);
  return parts.join(" ");
}

/** Short factual gloss for the Cash & Sustainability KPI tiles. */
export function runwayGloss(months: number | null): string {
  if (months == null) return "Not enough data to estimate";
  return `About ${months} month${months === 1 ? "" : "s"} of operations at current spending`;
}

export function budgetGloss(percent: number, remaining: number): string {
  return `${formatCurrency(remaining)} left of the annual budget`;
}

export interface HighlightsInput {
  totalCash: number;
  netIncome: number;
  monthsOfRunway: number | null;
  budget: { percent: number };
  metrics: { total: number; onTrack: number; atRisk: number };
  risks: { red: number; yellow: number };
}

export interface Highlight {
  label: string;
  value: string;
  gloss: string;
  /** traffic-light tone used to color-code the tile */
  tone: "positive" | "neutral" | "warning" | "danger";
}

export function buildHighlights(h: HighlightsInput): Highlight[] {
  const risksNeedingAttention = h.risks.red + h.risks.yellow;
  return [
    {
      label: "Cash on hand",
      value: formatCurrency(h.totalCash),
      gloss: "Total across all bank accounts",
      tone: "neutral",
    },
    {
      label: h.netIncome >= 0 ? "Surplus this period" : "Deficit this period",
      value: formatCurrency(Math.abs(h.netIncome)),
      gloss: h.netIncome >= 0 ? "Revenue exceeded expenses" : "Expenses exceeded revenue",
      tone: h.netIncome >= 0 ? "positive" : "warning",
    },
    {
      label: "Months of runway",
      value: h.monthsOfRunway != null ? `${h.monthsOfRunway} mo` : "—",
      gloss: runwayGloss(h.monthsOfRunway),
      tone:
        h.monthsOfRunway == null
          ? "neutral"
          : h.monthsOfRunway < 3
            ? "danger"
            : h.monthsOfRunway < 6
              ? "warning"
              : "positive",
    },
    {
      label: "Budget used",
      value: `${h.budget.percent}%`,
      gloss: "Of the active annual budget",
      tone:
        h.budget.percent >= 100 ? "danger" : h.budget.percent >= 90 ? "warning" : "positive",
    },
    {
      label: "Program goals on track",
      value: h.metrics.total > 0 ? `${h.metrics.onTrack} of ${h.metrics.total}` : "—",
      gloss:
        h.metrics.total > 0
          ? `${h.metrics.atRisk} below target this period`
          : "No goals set for this period",
      tone: h.metrics.total === 0 ? "neutral" : h.metrics.onTrack >= h.metrics.total ? "positive" : "warning",
    },
    {
      label: "Risks needing attention",
      value: String(risksNeedingAttention),
      gloss:
        risksNeedingAttention === 0
          ? "All risks on track"
          : `${h.risks.red} high · ${h.risks.yellow} watch`,
      tone:
        risksNeedingAttention === 0
          ? "positive"
          : h.risks.red > 0
            ? "danger"
            : "warning",
    },
  ];
}

export interface NarrativeInput {
  label: string;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalCash: number;
  monthsOfRunway: number | null;
  metrics: { total: number; onTrack: number };
  risks: { red: number; yellow: number };
}

/** Two-to-three sentence factual overview shown at the top of the report. */
export function buildNarrative(n: NarrativeInput): string {
  const s1 = `During ${n.label} the organization received ${formatCurrency(n.totalRevenue)} and spent ${formatCurrency(n.totalExpenses)}, ending with ${surplusPhrase(n.netIncome)}.`;
  const s2 = `Cash on hand totals ${formatCurrency(n.totalCash)}${
    n.monthsOfRunway != null
      ? `, about ${n.monthsOfRunway} month${n.monthsOfRunway === 1 ? "" : "s"} of operations at the current spending rate`
      : ""
  }.`;
  const parts: string[] = [];
  if (n.metrics.total > 0) {
    parts.push(`${n.metrics.onTrack} of ${n.metrics.total} program goals are on track`);
  }
  const attention = n.risks.red + n.risks.yellow;
  if (attention > 0) {
    parts.push(`${attention} risk${attention === 1 ? "" : "s"} require${attention === 1 ? "s" : ""} attention`);
  } else {
    parts.push("no risks require attention");
  }
  const s3 = `For this period, ${parts.join(" and ")}.`;
  return `${s1} ${s2} ${s3}`;
}

/** Factual one-line gloss for the Fund Balances section. */
export function fundBalancesSummary(total: number, count: number): string {
  if (count === 0) return "No funds are configured.";
  return `Across ${count} fund${count === 1 ? "" : "s"}, the organization holds ${formatCurrency(total)} in net assets.`;
}
