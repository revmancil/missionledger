import { asDate } from "./safeIso";

export interface BudgetMonthPeriod {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** UTC calendar months from budget start through end (inclusive). */
export function buildBudgetMonthPeriods(startRaw: unknown, endRaw: unknown): BudgetMonthPeriod[] {
  const start = asDate(startRaw);
  const end = asDate(endRaw);
  if (!start || !end || start.getTime() > end.getTime()) return [];

  const months: BudgetMonthPeriod[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    months.push({ key, label, start: monthStart, end: monthEnd });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (months.length > 24) break;
  }
  return months;
}

export function utcMonthKey(value: unknown): string | null {
  const d = asDate(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Coerce client/DB monthly arrays to exactly `monthCount` values. */
export function normalizeMonthlyAmounts(
  raw: unknown,
  monthCount: number,
  fallbackAnnual = 0,
): number[] {
  if (monthCount <= 0) return [];

  const parsed = Array.isArray(raw)
    ? raw.map((v) => roundMoney(Number(v) || 0))
    : null;

  if (parsed && parsed.length > 0) {
    const out = new Array(monthCount).fill(0);
    for (let i = 0; i < monthCount; i++) out[i] = roundMoney(parsed[i] ?? 0);
    return out;
  }

  const annual = roundMoney(fallbackAnnual);
  const even = roundMoney(annual / monthCount);
  const out = Array(monthCount).fill(even);
  const diff = roundMoney(annual - even * monthCount);
  if (diff !== 0) out[monthCount - 1] = roundMoney(out[monthCount - 1] + diff);
  return out;
}

export function sumMonthlyAmounts(amounts: number[]): number {
  return roundMoney(amounts.reduce((s, v) => s + (Number(v) || 0), 0));
}

export function parseStoredMonthlyAmounts(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map((v) => roundMoney(Number(v) || 0));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => roundMoney(Number(v) || 0));
    } catch {
      return null;
    }
  }
  return null;
}
