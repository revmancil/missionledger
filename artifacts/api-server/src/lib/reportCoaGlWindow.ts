import { sql } from "drizzle-orm";

export type CoaGlWindow =
  | { kind: "through"; end: Date }
  | { kind: "range"; start: Date; end: Date }
  | { kind: "before"; before: Date };

/** Active COA rows, or inactive rows that still have GL in the window (e.g. cash linked after creation). */
export function sqlCoaActiveOrHasGlInWindow(companyId: string, win: CoaGlWindow) {
  const datePred =
    win.kind === "through"
      ? sql`AND gx.date <= ${win.end}`
      : win.kind === "range"
        ? sql`AND gx.date >= ${win.start} AND gx.date <= ${win.end}`
        : sql`AND gx.date < ${win.before}`;
  return sql`(
    c.is_active = true
    OR EXISTS (
      SELECT 1 FROM gl_entries gx
      LEFT JOIN journal_entries jex ON jex.id = gx.journal_entry_id AND jex.status != 'VOID'
      WHERE gx.account_id = c.id
        AND gx.company_id = ${companyId}
        AND gx.is_void = false
        ${datePred}
        AND (gx.journal_entry_id IS NULL OR jex.id IS NOT NULL)
    )
  )`;
}

export function hasReportBalance(amount: number, grossDebitsCredits: number): boolean {
  return Math.abs(amount) >= 0.005 || grossDebitsCredits > 0.005;
}
