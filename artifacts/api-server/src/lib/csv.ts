// A cell that Excel / Sheets / LibreOffice would run as a formula when the file is opened.
const FORMULA_START = /^[=+\-@\t\r]/;
// Plain numbers ("-25.00", "+15551234567", "-1,234.50") start with "-" or "+" but are not formulas.
const PLAIN_NUMBER = /^[+-]?\d[\d,]*(\.\d+)?$/;

/**
 * One CSV cell. Text is always quoted with embedded quotes doubled, and text that a
 * spreadsheet would execute as a formula ("=HYPERLINK(...)", "+cmd|...", "@SUM(...)") gets
 * a leading apostrophe so it opens as plain text. Accounting data is full of user-typed
 * names, memos and payees, so every text cell must go through here.
 *
 * Keep in sync with artifacts/missionledger/src/lib/csv.ts (the browser-side exports).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let text = String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}
