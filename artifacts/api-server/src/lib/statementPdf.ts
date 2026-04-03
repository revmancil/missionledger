/**
 * Best-effort parse of transaction lines from PDF-extracted text.
 * Works when the bank embeds a text layer (not scanned image-only PDFs).
 */

import type { StatementImportRow } from "./statementCsv";

function parsePdfDate(s: string): Date | null {
  const t = s.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(t);
  if (us) {
    let m = parseInt(us[1], 10);
    let day = parseInt(us[2], 10);
    let y = parseInt(us[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const tparse = Date.parse(t);
  if (!Number.isNaN(tparse)) return new Date(tparse);
  return null;
}

/** Skip obvious non-transaction lines */
function isNoiseLine(lower: string): boolean {
  if (lower.length < 8) return true;
  if (/^page\s+\d+/i.test(lower)) return true;
  if (/statement\s+(period|date|ending)/i.test(lower)) return true;
  if (/^(beginning|ending)\s+balance/i.test(lower)) return true;
  if (/account\s+(number|summary)/i.test(lower)) return true;
  if (/^total\s+/i.test(lower)) return true;
  if (/customer\s+service/i.test(lower)) return true;
  return false;
}

/**
 * Parse lines like: MM/DD/YYYY  PAYEE TEXT   ($12.34)  or  -$12.34  or  $500.00
 */
export function parseTransactionsFromPdfText(raw: string): {
  ok: StatementImportRow[];
  errors: string[];
} {
  const ok: StatementImportRow[] = [];
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/);

  // Amount at end: optional CR/DR, $, commas, optional parentheses for negatives
  const tailAmount =
    /\s+((?:CR|DR)\s+)?([\(\-])?\$?\s*([\d,]+\.\d{2})(\))?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();
    if (!line || isNoiseLine(lower)) continue;

    const dateMatch = line.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const date = parsePdfDate(dateMatch[1]);
    if (!date) {
      errors.push(`Line ${i + 1}: could not parse date "${dateMatch[1]}"`);
      continue;
    }

    const afterDate = line.slice(dateMatch[0].length).trim();
    const amtMatch = afterDate.match(tailAmount);
    if (!amtMatch) continue;

    const crdr = (amtMatch[1] || "").toUpperCase();
    const openNeg = amtMatch[2] || "";
    const numStr = amtMatch[3].replace(/,/g, "");
    const closeParen = amtMatch[4] || "";
    const amount = parseFloat(numStr);
    if (!Number.isFinite(amount) || amount === 0) continue;

    const payeeRaw = afterDate.slice(0, afterDate.length - amtMatch[0].length).trim();
    const payee = payeeRaw.replace(/\s+/g, " ").slice(0, 500) || "Statement line";

    let type: "DEBIT" | "CREDIT";
    if (crdr.includes("DR")) type = "DEBIT";
    else if (crdr.includes("CR")) type = "CREDIT";
    else if (openNeg === "(" || openNeg === "-" || closeParen === ")") type = "DEBIT";
    else type = "CREDIT";

    ok.push({ date, payee, amount: Math.abs(amount), type });
  }

  return { ok, errors };
}
