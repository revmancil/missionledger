/**
 * Parse bank-export CSV (Chase, BofA, generic) into normalized rows for import.
 * Convention: single Amount column — negative = money out (DEBIT), positive = in (CREDIT).
 * Or separate Debit / Credit columns.
 */

export type StatementImportRow = {
  date: Date;
  payee: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
};

type ColumnMapping = {
  date: string;
  payee: string[];
  amount?: string;
  debit?: string;
  credit?: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvToObjects(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreHeader(h: string, keywords: string[]): number {
  const n = normHeader(h);
  let s = 0;
  for (const k of keywords) {
    if (n === k) s += 10;
    else if (n.includes(k)) s += 5;
  }
  return s;
}

export function detectColumnMapping(headers: string[]): ColumnMapping | null {
  if (!headers.length) return null;

  let bestDate: { h: string; s: number } | null = null;
  for (const h of headers) {
    const n = normHeader(h);
    if (/opening|closing|available|statement/.test(n) && /date/.test(n)) continue;
    const s = scoreHeader(h, ["transaction date", "posting date", "post date", "trans date", "date"]);
    if (s > 0 && (!bestDate || s > bestDate.s)) bestDate = { h, s };
  }
  if (!bestDate) {
    for (const h of headers) {
      if (/^date$/i.test(h.trim())) {
        bestDate = { h, s: 1 };
        break;
      }
    }
  }
  if (!bestDate) return null;

  const payeeCandidates: string[] = [];
  for (const h of headers) {
    const s = scoreHeader(h, [
      "description",
      "memo",
      "payee",
      "details",
      "narrative",
      "merchant",
      "name",
    ]);
    if (s > 0) payeeCandidates.push(h);
  }
  if (payeeCandidates.length === 0) {
    for (const h of headers) {
      const n = normHeader(h);
      if (n.includes("desc") || n === "memo") payeeCandidates.push(h);
    }
  }

  let debit: string | undefined;
  let credit: string | undefined;
  let amount: string | undefined;
  for (const h of headers) {
    const n = normHeader(h);
    if (/debit|withdrawal|withdrawals|payment/.test(n) && !/credit/.test(n)) {
      if (!debit || scoreHeader(h, ["debit", "withdrawal"]) > scoreHeader(debit, ["debit", "withdrawal"]))
        debit = h;
    }
    if (/credit|deposit|deposits/.test(n) && !/debit/.test(n)) {
      if (!credit || scoreHeader(h, ["credit", "deposit"]) > scoreHeader(credit, ["credit", "deposit"]))
        credit = h;
    }
    if (/^amount$|^transaction amount$|^amt$/.test(n) || (n === "amount" && !amount)) {
      amount = h;
    }
  }
  if (!amount) {
    for (const h of headers) {
      if (normHeader(h) === "amount") {
        amount = h;
        break;
      }
    }
  }

  const hasPair = debit && credit;
  if (!hasPair && !amount) return null;

  if (payeeCandidates.length === 0) {
    const skip = new Set([bestDate.h, amount, debit, credit].filter(Boolean) as string[]);
    const rest = headers.filter((h) => !skip.has(h));
    if (rest.length) payeeCandidates.push(...rest);
  }

  return {
    date: bestDate.h,
    payee: payeeCandidates.length ? payeeCandidates : [headers.find((x) => x !== bestDate!.h) ?? ""],
    ...(hasPair ? { debit, credit } : { amount }),
  };
}

function parseMoney(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === "-" || t === "—") return null;
  const cleaned = t.replace(/[$,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseBankDate(raw: string): Date | null {
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) {
    const m = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    const y = parseInt(us[3], 10);
    const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

function buildPayee(row: Record<string, string>, payeeCols: string[]): string {
  const parts = payeeCols
    .map((c) => row[c]?.trim())
    .filter(Boolean) as string[];
  const joined = parts.join(" — ").trim();
  return joined || "Bank import";
}

export function rowsToStatementImports(
  objects: Record<string, string>[],
  mapping: ColumnMapping,
): { ok: StatementImportRow[]; errors: string[] } {
  const ok: StatementImportRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = objects[i];
    const line = i + 2;
    const date = parseBankDate(row[mapping.date] ?? "");
    if (!date) {
      errors.push(`Row ${line}: invalid or missing date`);
      continue;
    }
    const payee = buildPayee(row, mapping.payee);

    let type: "DEBIT" | "CREDIT";
    let amount: number;

    if (mapping.debit && mapping.credit) {
      const deb = parseMoney(row[mapping.debit]) ?? 0;
      const cred = parseMoney(row[mapping.credit]) ?? 0;
      if (deb > 0 && cred > 0) {
        errors.push(`Row ${line}: both debit and credit set`);
        continue;
      }
      if (deb <= 0 && cred <= 0) {
        errors.push(`Row ${line}: no debit or credit amount`);
        continue;
      }
      if (deb > 0) {
        type = "DEBIT";
        amount = deb;
      } else {
        type = "CREDIT";
        amount = cred;
      }
    } else if (mapping.amount) {
      const raw = parseMoney(row[mapping.amount!]);
      if (raw === null || raw === 0) {
        errors.push(`Row ${line}: missing amount`);
        continue;
      }
      if (raw < 0) {
        type = "DEBIT";
        amount = Math.abs(raw);
      } else {
        type = "CREDIT";
        amount = raw;
      }
    } else {
      errors.push(`Row ${line}: no amount mapping`);
      continue;
    }

    ok.push({ date, payee, amount, type });
  }

  return { ok, errors };
}
