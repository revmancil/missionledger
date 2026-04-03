/**
 * Parse `YYYY-MM-DD` (or ISO string — first 10 chars used) as a calendar date at
 * 12:00 UTC. Avoids `new Date("2026-01-01")` (UTC midnight) shifting to the prior
 * local calendar day in the Americas, and keeps one unambiguous instant for Postgres.
 */
export function parseYmdToUtcNoon(raw: unknown): { ymd: string; date: Date } | null {
  const head = String(raw ?? "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return { ymd: head, date };
}

/** Today's calendar date as YYYY-MM-DD in UTC (for as-of ≤ today checks on the server). */
export function utcYmdToday(): string {
  const n = new Date();
  const y = n.getUTCFullYear();
  const mo = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Inclusive UTC calendar-day bounds for `YYYY-MM-DD`.
 * Use for report ranges so `2026-01-01` is not parsed as UTC midnight (which shifts to the prior local day in the Americas).
 */
export function parseYmdToUtcDayBounds(raw: unknown): { from: Date; to: Date; ymd: string } | null {
  const head = String(raw ?? "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const from = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  if (from.getUTCFullYear() !== y || from.getUTCMonth() !== mo - 1 || from.getUTCDate() !== d) return null;
  return { from, to, ymd: head };
}

/**
 * Coerce DB/driver values (Date, ISO string, number) to a Date or null.
 * Never throws — avoids TypeError when code assumes Date but pg returns a string.
 */
export function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  try {
    const d = new Date(value as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** ISO 8601 for JSON; invalid dates → epoch (never throws). */
export function toIsoString(value: unknown): string {
  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
    return d.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** Optional timestamps; invalid → null (never throws). */
export function toIsoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
