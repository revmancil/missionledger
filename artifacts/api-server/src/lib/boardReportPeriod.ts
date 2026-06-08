import { parseYmdToUtcDayBounds, utcYmdToday } from "./safeIso";

export type BoardPeriodKind = "month" | "quarter" | "year" | "ytd";

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

export function resolveBoardPeriod(kind: BoardPeriodKind, ref = new Date()): BoardReportPeriod | null {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const today = utcYmdToday();

  let startYmd: string;
  let endYmd: string;
  let label: string;

  if (kind === "month") {
    startYmd = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    endYmd = capEndYmd(utcMonthEndYmd(y, m), today);
    label = `${MONTH_NAMES[m]} ${y}`;
  } else if (kind === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    startYmd = `${y}-${String(qStart + 1).padStart(2, "0")}-01`;
    endYmd = capEndYmd(utcMonthEndYmd(y, qStart + 2), today);
    const qNum = Math.floor(qStart / 3) + 1;
    label = `Q${qNum} ${y}`;
  } else if (kind === "year") {
    startYmd = `${y}-01-01`;
    endYmd = capEndYmd(`${y}-12-31`, today);
    label = `Calendar Year ${y}`;
  } else if (kind === "ytd") {
    startYmd = `${y}-01-01`;
    endYmd = today;
    label = `Year to Date ${y}`;
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
