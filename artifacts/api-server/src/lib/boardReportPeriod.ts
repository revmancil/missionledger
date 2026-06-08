import { parseYmdToUtcDayBounds, utcYmdToday } from "./safeIso";

export type BoardPeriodKind = "month" | "quarter" | "year" | "ytd";

export interface BoardPeriodAnchor {
  year?: number;
  month?: number;
  quarter?: number;
}

export interface BoardReportPeriod {
  kind: BoardPeriodKind;
  startYmd: string;
  endYmd: string;
  label: string;
  start: Date;
  end: Date;
}

function utcMonthEndYmd(year: number, monthIndex0: number): string {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function capEndYmd(endYmd: string, todayYmd: string): string {
  return endYmd > todayYmd ? todayYmd : endYmd;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function validYear(y: number | undefined, fallback: number): number {
  return y != null && y >= 1900 && y <= 2100 ? y : fallback;
}

function validMonth(m: number | undefined, fallbackIndex0: number): number {
  return m != null && m >= 1 && m <= 12 ? m - 1 : fallbackIndex0;
}

function validQuarter(q: number | undefined, fallback: number): number {
  return q != null && q >= 1 && q <= 4 ? q : fallback;
}

export function resolveBoardPeriod(
  kind: BoardPeriodKind,
  anchor: BoardPeriodAnchor = {},
  ref = new Date(),
): BoardReportPeriod | null {
  const today = utcYmdToday();
  const y = validYear(anchor.year, ref.getUTCFullYear());

  let startYmd: string;
  let endYmd: string;
  let label: string;

  if (kind === "month") {
    const m = validMonth(anchor.month, ref.getUTCMonth());
    startYmd = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    endYmd = capEndYmd(utcMonthEndYmd(y, m), today);
    label = `${MONTH_NAMES[m]} ${y}`;
  } else if (kind === "quarter") {
    const q = validQuarter(anchor.quarter, Math.floor(ref.getUTCMonth() / 3) + 1);
    const qStart = (q - 1) * 3;
    startYmd = `${y}-${String(qStart + 1).padStart(2, "0")}-01`;
    endYmd = capEndYmd(utcMonthEndYmd(y, qStart + 2), today);
    label = `Q${q} ${y}`;
  } else if (kind === "year") {
    startYmd = `${y}-01-01`;
    endYmd = capEndYmd(`${y}-12-31`, today);
    label = `Calendar Year ${y}`;
  } else if (kind === "ytd") {
    startYmd = `${y}-01-01`;
    endYmd = y === ref.getUTCFullYear() ? today : capEndYmd(`${y}-12-31`, today);
    label = y === ref.getUTCFullYear() ? `Year to Date ${y}` : `Calendar Year ${y}`;
  } else {
    return null;
  }

  const startBounds = parseYmdToUtcDayBounds(startYmd);
  const endBounds = parseYmdToUtcDayBounds(endYmd);
  if (!startBounds || !endBounds) return null;

  return {
    kind,
    startYmd,
    endYmd,
    label,
    start: startBounds.from,
    end: endBounds.to,
  };
}

export function parseBoardPeriodKind(raw: unknown): BoardPeriodKind {
  const v = String(raw ?? "ytd").toLowerCase();
  if (v === "month" || v === "quarter" || v === "year" || v === "ytd") return v;
  return "ytd";
}

export function parseBoardPeriodAnchor(raw: {
  year?: unknown;
  month?: unknown;
  quarter?: unknown;
}): BoardPeriodAnchor {
  const year = raw.year != null && String(raw.year).trim() !== ""
    ? parseInt(String(raw.year), 10)
    : undefined;
  const month = raw.month != null && String(raw.month).trim() !== ""
    ? parseInt(String(raw.month), 10)
    : undefined;
  const quarter = raw.quarter != null && String(raw.quarter).trim() !== ""
    ? parseInt(String(raw.quarter), 10)
    : undefined;
  return { year, month, quarter };
}

export function quarterForYmd(ymd: string): { year: number; quarter: number } {
  const b = parseYmdToUtcDayBounds(ymd);
  if (!b) {
    const now = new Date();
    return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
  }
  const d = b.from;
  return {
    year: d.getUTCFullYear(),
    quarter: Math.floor(d.getUTCMonth() / 3) + 1,
  };
}
