import { Router, type Request } from "express";
import {
  db, transactions, transactionSplits, chartOfAccounts, accounts,
  bankAccounts, funds, vendors, companies, journalEntryLines, donations,
  glEntries, journalEntries,
} from "@workspace/db";
import { eq, and, inArray, sql, ne } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries, voidGlEntries } from "../lib/gl";
import { logAudit, snap } from "../lib/audit";
import {
  parseCsvToObjects,
  detectColumnMapping,
  rowsToStatementImports,
  type StatementImportRow,
} from "../lib/statementCsv";
import { parseTransactionsFromPdfText } from "../lib/statementPdf";
import { toIsoStringOrNull, asDate } from "../lib/safeIso";
import { stringifyJsonForApi } from "../lib/jsonSafe";
import { listTransactionRowsForCompany, loadSplitRowsByTransactionIds } from "../lib/transactionList";
import { recomputeBankBalanceFromTransactions as recomputeBankBalance } from "../lib/bankBalance";

async function getClosedUntil(companyId: string): Promise<Date | null> {
  const [co] = await db.select({ closedUntil: companies.closedUntil }).from(companies).where(eq(companies.id, companyId));
  return asDate(co?.closedUntil);
}

function isInClosedPeriod(txDate: unknown, closedUntil: unknown): boolean {
  const cu = asDate(closedUntil);
  if (!cu) return false;
  const d = asDate(txDate);
  if (!d) return false;
  return d <= cu;
}

/** Period-lock error line; closedUntil may be string from DB in some code paths. */
function closedUntilLabel(closedUntil: unknown): string {
  const d = asDate(closedUntil);
  return d ? d.toISOString().slice(0, 10) : "(unknown)";
}

const router = Router();

// ── Fingerprint helpers ────────────────────────────────────────────────────────
/** ISO string for API JSON; invalid DB dates must not throw (would 500 GET /transactions). */
function formatTxIso(value: unknown): string {
  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
    return d.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** Builds a stable duplicate-detection key: "{amount}_{YYYY-MM-DD}_{payee}" */
function buildFingerprint(amount: number, date: Date | string, payee: string): string {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = Number.isNaN(d.getTime())
    ? "1970-01-01"
    : d.toISOString().substring(0, 10);
  const payeeNorm = String(payee).trim().toLowerCase().replace(/\s+/g, " ");
  return `${Number(amount).toFixed(2)}_${dateStr}_${payeeNorm}`;
}

/** Returns existing non-void transaction with same fingerprint for this company, excluding a given id. */
async function findDuplicate(
  companyId: string,
  fingerprint: string,
  excludeId?: string
): Promise<{ id: string; date: Date; payee: string } | null> {
  const rows = await db
    .select({ id: transactions.id, date: transactions.date, payee: transactions.payee })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.transactionFingerprint, fingerprint),
        eq(transactions.isVoid, false),
        ...(excludeId ? [ne(transactions.id, excludeId)] : [])
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function getLookups(companyId: string) {
  const [allCoa, allFunds, allBanks, allVendors] = await Promise.all([
    db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId)),
    db.select().from(funds).where(eq(funds.companyId, companyId)),
    db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId)),
    db.select().from(vendors).where(eq(vendors.companyId, companyId)),
  ]);
  return {
    coaMap: Object.fromEntries(allCoa.map((a) => [a.id, a])),
    fundMap: Object.fromEntries(allFunds.map((f) => [f.id, f])),
    bankMap: Object.fromEntries(allBanks.map((b) => [b.id, b])),
    vendorMap: Object.fromEntries(allVendors.map((v) => [v.id, v])),
  };
}

/** Nested lookup rows still have raw Dates; res.json → JSON.stringify uses Date#toJSON → toISOString() and throws on invalid dates. */
function serializeNestedEntity(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    ...row,
    createdAt: formatTxIso(row.createdAt),
    updatedAt: formatTxIso(row.updatedAt),
  };
}

function serializeNestedBank(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const { plaidAccessToken, plaidItemId, ...rest } = row;
  void plaidAccessToken;
  void plaidItemId;
  return {
    ...rest,
    createdAt: formatTxIso(row.createdAt),
    updatedAt: formatTxIso(row.updatedAt),
    plaidLastSyncedAt:
      row.plaidLastSyncedAt != null ? formatTxIso(row.plaidLastSyncedAt) : null,
  };
}

function serializeTx(
  tx: any,
  splits: any[],
  lookups: Awaited<ReturnType<typeof getLookups>>
) {
  const { coaMap, fundMap, bankMap, vendorMap } = lookups;
  return {
    ...tx,
    date: formatTxIso(tx.date),
    createdAt: formatTxIso(tx.createdAt),
    updatedAt: formatTxIso(tx.updatedAt),
    chartAccount: tx.chartAccountId
      ? serializeNestedEntity(coaMap[tx.chartAccountId] as Record<string, unknown>)
      : null,
    fund: tx.fundId ? serializeNestedEntity(fundMap[tx.fundId] as Record<string, unknown>) : null,
    bankAccount: tx.bankAccountId
      ? serializeNestedBank(bankMap[tx.bankAccountId] as Record<string, unknown>)
      : null,
    vendor: tx.vendorId
      ? serializeNestedEntity(vendorMap[tx.vendorId] as Record<string, unknown>)
      : null,
    splits: splits.map((s) => ({
      ...s,
      createdAt: formatTxIso(s.createdAt),
      updatedAt: formatTxIso(s.updatedAt),
      chartAccount: s.chartAccountId
        ? serializeNestedEntity(coaMap[s.chartAccountId] as Record<string, unknown>)
        : null,
      vendor: s.vendorId
        ? serializeNestedEntity(vendorMap[s.vendorId] as Record<string, unknown>)
        : null,
    })),
  };
}

async function upsertSplits(
  transactionId: string,
  companyId: string,
  rawSplits: Array<{ chartAccountId?: string | null; vendorId?: string | null; fundId?: string | null; amount: number; memo?: string | null; functionalType?: string | null; sortOrder?: number }>
) {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId));
  if (rawSplits.length === 0) return;
  for (let i = 0; i < rawSplits.length; i++) {
    const s = rawSplits[i];
    await db.insert(transactionSplits).values({
      transactionId,
      companyId,
      chartAccountId: s.chartAccountId ?? null,
      vendorId: s.vendorId ?? null,
      fundId: s.fundId ?? null,
      amount: s.amount,
      memo: s.memo ?? null,
      functionalType: s.functionalType ?? null,
      sortOrder: s.sortOrder ?? i,
    });
  }
}

/** Shared CSV/PDF bulk import (admin). */
async function commitStatementImportRows(
  req: Request,
  companyId: string,
  bankAccountId: string,
  bankName: string,
  rows: StatementImportRow[],
  parseErrors: string[],
  auditSuffix: string,
): Promise<{
  imported: number;
  skippedDuplicates: number;
  skippedLockedPeriod: number;
  parseErrors: string[];
  parseErrorsTruncated: boolean;
  message?: string;
}> {
  if (rows.length > 5000) {
    throw Object.assign(new Error("Too many rows (max 5000 per import)"), { status: 400 });
  }

  const closedUntil = await getClosedUntil(companyId);
  let skippedDuplicates = 0;
  let skippedLockedPeriod = 0;
  const batchSeen = new Set<string>();
  const candidates: Array<{
    date: Date;
    payee: string;
    amount: number;
    type: "DEBIT" | "CREDIT";
    fingerprint: string;
  }> = [];

  for (const r of rows) {
    if (isInClosedPeriod(r.date, closedUntil)) {
      skippedLockedPeriod++;
      continue;
    }
    const fingerprint = buildFingerprint(r.amount, r.date, r.payee);
    if (batchSeen.has(fingerprint)) {
      skippedDuplicates++;
      continue;
    }
    batchSeen.add(fingerprint);
    candidates.push({ ...r, fingerprint });
  }

  let finalRows = candidates;
  if (candidates.length > 0) {
    const fps = candidates.map((c) => c.fingerprint);
    const existingFp = new Set<string>();
    const chunkSize = 400;
    for (let i = 0; i < fps.length; i += chunkSize) {
      const part = [...new Set(fps.slice(i, i + chunkSize))].filter(
        (f): f is string => typeof f === "string" && f.length > 0,
      );
      if (part.length === 0) continue;
      const hits = await db
        .select({ f: transactions.transactionFingerprint })
        .from(transactions)
        .where(
          and(
            eq(transactions.companyId, companyId),
            eq(transactions.isVoid, false),
            inArray(transactions.transactionFingerprint, part),
          ),
        );
      for (const h of hits) {
        if (h.f) existingFp.add(h.f);
      }
    }
    finalRows = candidates.filter((c) => !existingFp.has(c.fingerprint));
    skippedDuplicates += candidates.length - finalRows.length;
  }

  if (finalRows.length === 0) {
    return {
      imported: 0,
      skippedDuplicates,
      skippedLockedPeriod,
      parseErrors: parseErrors.slice(0, 40),
      parseErrorsTruncated: parseErrors.length > 40,
      message: "No new transactions to import (duplicates, locked period, or empty).",
    };
  }

  const inserted = await db
    .insert(transactions)
    .values(
      finalRows.map((r) => ({
        companyId,
        bankAccountId,
        date: r.date,
        payee: r.payee,
        amount: r.amount,
        type: r.type,
        status: "UNCLEARED" as const,
        isSplit: false,
        transactionFingerprint: r.fingerprint,
        isVoid: false,
      })),
    )
    .returning({ id: transactions.id });

  for (const row of inserted) {
    await generateGlEntries(row.id, companyId).catch((e) =>
      console.error("[GL] statement import error:", e),
    );
  }
  await recomputeBankBalance(bankAccountId, companyId);

  const { id: userId, email: userEmail, name: userName } = (req as any).user;
  logAudit({
    req,
    companyId,
    userId,
    userEmail,
    userName,
    action: "CREATE",
    entityType: "TRANSACTION",
    entityId: inserted[0]?.id ?? null,
    description: `Imported ${inserted.length} transaction(s) from ${auditSuffix} into ${bankName}`,
    newValue: { count: inserted.length, bankAccountId },
  });

  return {
    imported: inserted.length,
    skippedDuplicates,
    skippedLockedPeriod,
    parseErrors: parseErrors.slice(0, 40),
    parseErrorsTruncated: parseErrors.length > 40,
  };
}

// ── GET /transactions ─────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    if (!companyId) {
      return res.status(400).json({
        error: "MISSING_ORG",
        message: "Your session has no organization. Try signing out and back in, or switch organization.",
      });
    }
    const { bankAccountId, status } = req.query;

    let all = await listTransactionRowsForCompany(companyId);

    if (bankAccountId) all = all.filter((t) => t.bankAccountId === bankAccountId);
    if (status) all = all.filter((t) => t.status === status);

    const txIds = all.map((t) => t.id);
    const allSplits = await loadSplitRowsByTransactionIds(txIds);

    const splitsByTx = allSplits.reduce<Record<string, any[]>>((acc, s) => {
      (acc[s.transactionId] ??= []).push(s);
      return acc;
    }, {});

    const lookups = await getLookups(companyId);
    const closedUntil = await getClosedUntil(companyId);

    const serialized: any[] = all.map((tx) => ({
      ...serializeTx(tx, splitsByTx[tx.id] ?? [], lookups),
      isClosed: isInClosedPeriod(tx.date, closedUntil),
      source: "TRANSACTION",
    }));

    // Merge JE GL entries for all bank accounts (register filters client-side by bank)
    const allBanks = await db
      .select({ id: bankAccounts.id, glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(eq(bankAccounts.companyId, companyId));

    // Build glAccountId → bankAccountId map for all banks
    const glToBankMap: Record<string, string> = {};
    const banksWithoutGlAccount: { id: string }[] = [];
    for (const b of allBanks) {
      if (b.glAccountId) {
        glToBankMap[b.glAccountId] = b.id;
      } else {
        banksWithoutGlAccount.push(b);
      }
    }

    // For banks without a linked GL account, map ALL ASSET-type account IDs (both COA and
    // legacy accounts table) that aren't claimed by another bank. This is necessary because:
    // - New JEs use chart_of_accounts IDs (form fetches /api/chart-of-accounts)
    // - Old JEs created before the form fix use legacy accounts table IDs
    // Both produce GL entries with accountId = <that table's UUID>; we must cover both.
    if (banksWithoutGlAccount.length > 0) {
      const firstUnlinkedBankId = banksWithoutGlAccount[0].id;
      const claimedIds = new Set(allBanks.filter(b => b.glAccountId).map(b => b.glAccountId!));

      // COA ASSET accounts
      const allCoa = await db
        .select({ id: chartOfAccounts.id, type: chartOfAccounts.type })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.companyId, companyId));
      for (const coa of allCoa) {
        if (coa.type === "ASSET" && !claimedIds.has(coa.id) && !glToBankMap[coa.id]) {
          glToBankMap[coa.id] = firstUnlinkedBankId;
        }
      }

      // Legacy ASSET accounts (for JEs created before the COA migration)
      const allLegacy = await db
        .select({ id: accounts.id, type: accounts.type })
        .from(accounts)
        .where(eq(accounts.companyId, companyId));
      for (const a of allLegacy) {
        if (a.type === "ASSET" && !claimedIds.has(a.id) && !glToBankMap[a.id]) {
          glToBankMap[a.id] = firstUnlinkedBankId;
        }
      }
    }

    if (Object.keys(glToBankMap).length > 0) {
      // Fetch all MANUAL_JE GL entries that hit any bank's GL account
      const jeGlRows = await db
        .select({
          id: glEntries.id,
          date: glEntries.date,
          amount: glEntries.amount,
          entryType: glEntries.entryType,
          description: glEntries.description,
          journalEntryId: glEntries.journalEntryId,
          accountId: glEntries.accountId,
          fundId: glEntries.fundId,
          fundName: glEntries.fundName,
          createdAt: glEntries.createdAt,
        })
        .from(glEntries)
        .where(
          and(
            eq(glEntries.companyId, companyId),
            eq(glEntries.sourceType, "MANUAL_JE"),
            eq(glEntries.isVoid, false),
          )
        );

      // Only keep rows that hit a known bank GL account
      const bankJeRows = jeGlRows.filter(r => glToBankMap[r.accountId]);

      if (bankJeRows.length > 0) {
        // Resolve JE entry numbers for display
        const jeIds = [...new Set(bankJeRows.map(r => r.journalEntryId).filter(Boolean) as string[])];
        const jeMap: Record<string, string> = {};
        if (jeIds.length > 0) {
          const jeList = await db
            .select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber })
            .from(journalEntries)
            .where(inArray(journalEntries.id, jeIds));
          for (const je of jeList) jeMap[je.id] = je.entryNumber;
        }

        for (const gl of bankJeRows) {
          const jeNumber = gl.journalEntryId ? (jeMap[gl.journalEntryId] ?? null) : null;
          const bankId = glToBankMap[gl.accountId];
          serialized.push({
            id: `gl-${gl.id}`,
            date: gl.date instanceof Date ? gl.date.toISOString() : gl.date,
            payee: gl.description || "Journal Entry",
            amount: gl.amount,
            // GL convention is opposite to bank register convention for asset accounts:
            // GL DEBIT to bank = increase = Deposit (register "CREDIT")
            // GL CREDIT to bank = decrease = Payment (register "DEBIT")
            type: gl.entryType === "DEBIT" ? "CREDIT" : "DEBIT",
            status: "CLEARED",
            checkNumber: null,
            referenceNumber: jeNumber,
            memo: gl.description || null,
            isVoid: false,
            isSplit: false,
            isClosed: isInClosedPeriod(gl.date, closedUntil),
            journalEntryId: gl.journalEntryId ?? null,
            bankAccountId: bankId,
            chartAccount: null,
            fund: gl.fundId ? { id: gl.fundId, name: gl.fundName ?? "" } : null,
            bankAccount: null,
            vendor: null,
            splits: [],
            source: "JOURNAL_ENTRY",
            createdAt: gl.createdAt instanceof Date ? gl.createdAt.toISOString() : gl.createdAt,
          });
        }

        // Re-sort: newest date first, then by createdAt
        serialized.sort((a, b) => {
          const d = new Date(b.date).getTime() - new Date(a.date).getTime();
          return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }
    }

    const payload = {
      closedUntil: toIsoStringOrNull(closedUntil),
      transactions: serialized,
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(stringifyJsonForApi(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Get transactions error:", msg, err);
    const debug =
      process.env.MISSIONLEDGER_DEBUG_API_ERRORS === "1" ||
      process.env.MISSIONLEDGER_DEBUG_API_ERRORS === "true";
    res.status(500).json({
      error: "Internal server error",
      ...(debug ? { detail: msg } : {}),
    });
  }
});

// ── POST /transactions ────────────────────────────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      bankAccountId, date, payee, vendorId,
      amount, type, status,
      chartAccountId, memo, checkNumber, referenceNumber,
      fundId, splits: rawSplits, functionalType, donorName,
      donorLines: rawDonorLines, showDonorSplit,
    } = req.body ?? {};

    if (!date || !payee || amount === undefined)
      return res.status(400).json({ error: "date, payee, and amount are required" });

    // Period-close protection
    const closedUntil = await getClosedUntil(companyId);
    if (isInClosedPeriod(date, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntilLabel(closedUntil)}. Reopen the period before adding transactions.`,
        code: "PERIOD_LOCKED",
      });
    }

    const isSplit = Array.isArray(rawSplits) && rawSplits.length > 0;

    // Validate split sum
    if (isSplit) {
      const sum = rawSplits.reduce((acc: number, s: any) => acc + Number(s.amount), 0);
      const diff = Math.abs(sum - Number(amount));
      if (diff > 0.005) {
        return res.status(400).json({
          error: `Split amounts (${sum.toFixed(2)}) must equal the transaction total (${Number(amount).toFixed(2)})`,
        });
      }
    }

    // ── Duplicate detection ────────────────────────────────────────────────────
    const txDate = new Date(`${String(date).slice(0, 10)}T12:00:00.000Z`);
    const fingerprint = buildFingerprint(parseFloat(amount), txDate, payee);
    const dup = await findDuplicate(companyId, fingerprint);
    if (dup) {
      return res.status(409).json({
        error: "Duplicate Detected: This transaction is already in the Register.",
        code: "DUPLICATE_TRANSACTION",
        existingId: dup.id,
      });
    }

    // ── Atomic DB transaction ────────────────────────────────────────────────
    const created = await db.transaction(async (trx) => {
      const [row] = await trx
        .insert(transactions)
        .values({
          companyId,
          bankAccountId: bankAccountId ?? null,
          date: txDate,
          payee,
          vendorId: vendorId ?? null,
          amount: parseFloat(amount),
          type: (type as any) ?? "DEBIT",
          status: (status as any) ?? "UNCLEARED",
          chartAccountId: isSplit ? null : (chartAccountId ?? null),
          isSplit,
          memo: memo ?? null,
          checkNumber: checkNumber ?? null,
          referenceNumber: referenceNumber ?? null,
          fundId: fundId ?? null,
          isVoid: false,
          donorName: donorName ?? null,
          functionalType: isSplit ? null : (functionalType ?? null),
          transactionFingerprint: fingerprint,
        })
        .returning();
      if (isSplit) {
        await trx.delete(transactionSplits).where(eq(transactionSplits.transactionId, row.id));
        for (let i = 0; i < rawSplits.length; i++) {
          const s = rawSplits[i];
          await trx.insert(transactionSplits).values({
            transactionId: row.id,
            companyId,
            chartAccountId: s.chartAccountId ?? null,
            vendorId: s.vendorId ?? null,
            fundId: s.fundId ?? null,
            amount: s.amount,
            memo: s.memo ?? null,
            functionalType: s.functionalType ?? null,
            sortOrder: s.sortOrder ?? i,
          });
        }
      }
      return row;
    });

    // Generate double-entry GL records (fire-and-forget, non-blocking to response)
    await generateGlEntries(created.id, companyId).catch((e) =>
      console.error("[GL] create error:", e)
    );

    // Keep bank account balance in sync
    recomputeBankBalance(created.bankAccountId, companyId).catch((e) =>
      console.error("[Balance] create sync error:", e)
    );

    const { id: userId, email: userEmail, name: userName } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId,
      userEmail,
      userName,
      action: "CREATE",
      entityType: "TRANSACTION",
      entityId: created.id,
      description: `Created transaction: ${created.payee} $${created.amount.toFixed(2)} on ${formatTxIso(created.date).slice(0, 10)}`,
      newValue: snap(created as any),
    });

    const lookups = await getLookups(companyId);
    const splits = isSplit ? await loadSplitRowsByTransactionIds([created.id]) : [];

    res.status(201).json(serializeTx(created, splits, lookups));
  } catch (err) {
    console.error("Create transaction error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /transactions/import-statement — CSV bank export (admin) ─────────────
router.post("/import-statement", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, csvText } = req.body ?? {};
    if (!bankAccountId || typeof csvText !== "string") {
      return res.status(400).json({ error: "bankAccountId and csvText are required" });
    }
    if (csvText.length > 2_500_000) {
      return res.status(400).json({ error: "CSV text too large (max ~2.5MB)" });
    }

    const [bank] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));
    if (!bank) return res.status(404).json({ error: "Bank account not found" });

    const objects = parseCsvToObjects(csvText);
    if (objects.length === 0) {
      return res.status(400).json({ error: "No data rows found in CSV" });
    }

    const headers = Object.keys(objects[0]);
    const mapping = detectColumnMapping(headers);
    if (!mapping) {
      return res.status(400).json({
        error:
          "Could not detect columns. Export a CSV with a Date column and an Amount column (or separate Debit and Credit columns), plus a description column.",
      });
    }

    const { ok, errors: parseErrors } = rowsToStatementImports(objects, mapping);
    if (ok.length > 5000) {
      return res.status(400).json({ error: "Too many rows (max 5000 per import)" });
    }
    const result = await commitStatementImportRows(
      req,
      companyId,
      bankAccountId,
      bank.name,
      ok,
      parseErrors,
      "bank statement CSV",
    );
    res.json(result);
  } catch (err: any) {
    console.error("Statement import error:", err);
    const status = err?.status === 400 ? 400 : 500;
    const msg =
      status === 400 && err?.message ? err.message : "Failed to import statement";
    res.status(status).json({ error: msg });
  }
});

// ── POST /transactions/import-statement-pdf — text-layer PDF (admin) ───────────
router.post("/import-statement-pdf", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, pdfBase64 } = req.body ?? {};
    if (!bankAccountId || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "bankAccountId and pdfBase64 are required" });
    }

    const [bank] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.companyId, companyId)));
    if (!bank) return res.status(404).json({ error: "Bank account not found" });

    let buffer: Buffer;
    try {
      buffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64 PDF data" });
    }
    if (buffer.length < 100) {
      return res.status(400).json({ error: "PDF file is too small or empty" });
    }
    if (buffer.length > 12 * 1024 * 1024) {
      return res.status(400).json({ error: "PDF too large (max 12MB)" });
    }

    const pdfParseMod: { default?: (b: Buffer) => Promise<{ text: string }> } = await import(
      "pdf-parse",
    );
    const pdfParse = pdfParseMod.default ?? (pdfParseMod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const parsed = await pdfParse(buffer);
    const text = (parsed?.text ?? "").trim();
    if (!text || text.length < 20) {
      return res.status(400).json({
        error:
          "Could not read text from this PDF. It may be a scanned image; use your bank’s CSV download or a PDF with selectable text.",
      });
    }

    const { ok, errors: parseErrors } = parseTransactionsFromPdfText(text);
    if (ok.length === 0) {
      return res.status(400).json({
        error:
          "No transaction lines found in the PDF. Layout may be unsupported — try CSV export, or a PDF with a standard date + amount line format.",
        parseErrors: parseErrors.slice(0, 20),
      });
    }
    if (ok.length > 5000) {
      return res.status(400).json({ error: "Too many rows (max 5000 per import)" });
    }

    const result = await commitStatementImportRows(
      req,
      companyId,
      bankAccountId,
      bank.name,
      ok,
      parseErrors,
      "bank statement PDF",
    );
    res.json(result);
  } catch (err: any) {
    console.error("PDF statement import error:", err);
    const msg = err?.code === "MODULE_NOT_FOUND" || err?.message?.includes("pdf-parse")
      ? "PDF import dependency missing on server"
      : err?.message || "Failed to import PDF";
    res.status(500).json({ error: msg });
  }
});

// ── GET /transactions/:id/splits — JE lines or split lines for audit view ────
router.get("/:id/splits", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));

    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
    const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map((f) => [f.id, f]));

    // If transaction has a linked JE, return the JE lines for the audit view
    if (tx.journalEntryId) {
      const lines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, tx.journalEntryId));

      return res.json({
        transactionId: tx.id,
        journalEntryId: tx.journalEntryId,
        source: "JOURNAL_ENTRY",
        splits: lines.map((l) => ({
          id: l.id,
          account: serializeNestedEntity(coaMap[l.accountId] as Record<string, unknown>),
          fund: l.fundId ? serializeNestedEntity(fundMap[l.fundId] as Record<string, unknown>) : null,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          memo: l.description ?? null,
        })),
      });
    }

    // Otherwise return regular transaction splits
    const splits = await loadSplitRowsByTransactionIds([tx.id]);

    return res.json({
      transactionId: tx.id,
      journalEntryId: null,
      source: "TRANSACTION_SPLIT",
      splits: splits.map((s) => ({
        id: s.id,
        account: s.chartAccountId
          ? serializeNestedEntity(coaMap[s.chartAccountId] as Record<string, unknown>)
          : null,
        fund: null,
        debit: tx.type === "DEBIT" ? s.amount : 0,
        credit: tx.type === "CREDIT" ? s.amount : 0,
        memo: s.memo ?? null,
      })),
    });
  } catch (err) {
    console.error("Transaction splits error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /transactions/:id ─────────────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      date, payee, vendorId, amount, type, status,
      chartAccountId, memo, checkNumber, referenceNumber,
      fundId, bankAccountId, splits: rawSplits, functionalType, donorName,
      donorLines: rawDonorLines, showDonorSplit,
    } = req.body ?? {};

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isVoid) return res.status(400).json({ error: "Cannot edit a voided transaction" });

    // Period-close protection
    const closedUntil = await getClosedUntil(companyId);
    const effectiveDate = date ? new Date(`${String(date).slice(0, 10)}T12:00:00.000Z`) : existing.date;
    if (isInClosedPeriod(existing.date, closedUntil) || isInClosedPeriod(effectiveDate, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntilLabel(closedUntil)}. Reopen the period to edit this transaction.`,
        code: "PERIOD_LOCKED",
      });
    }

    const isSplit = Array.isArray(rawSplits) && rawSplits.length > 0;

    if (isSplit && amount !== undefined) {
      const sum = rawSplits.reduce((acc: number, s: any) => acc + Number(s.amount), 0);
      const diff = Math.abs(sum - Number(amount));
      if (diff > 0.005) {
        return res.status(400).json({
          error: `Split amounts (${sum.toFixed(2)}) must equal the transaction total (${Number(amount).toFixed(2)})`,
        });
      }
    }

    // ── Fingerprint update + duplicate check ────────────────────────────────
    const effectiveAmount = amount !== undefined ? parseFloat(amount) : existing.amount;
    const effectiveDateVal = date ? new Date(`${String(date).slice(0, 10)}T12:00:00.000Z`) : existing.date;
    const effectivePayee   = payee ?? existing.payee;
    const newFingerprint = buildFingerprint(effectiveAmount, effectiveDateVal, effectivePayee);
    const dup = await findDuplicate(companyId, newFingerprint, req.params.id);
    if (dup) {
      return res.status(409).json({
        error: "Duplicate Detected: This transaction is already in the Register.",
        code: "DUPLICATE_TRANSACTION",
        existingId: dup.id,
      });
    }

    // ── Atomic DB transaction ────────────────────────────────────────────────
    const updated = await db.transaction(async (trx) => {
      const [row] = await trx
        .update(transactions)
        .set({
          date: date ? new Date(`${String(date).slice(0, 10)}T12:00:00.000Z`) : undefined,
          payee: payee ?? undefined,
          vendorId: vendorId ?? null,
          amount: amount !== undefined ? parseFloat(amount) : undefined,
          type: (type as any) ?? undefined,
          status: (status as any) ?? undefined,
          chartAccountId: isSplit ? null : (chartAccountId ?? null),
          isSplit,
          memo: memo ?? null,
          checkNumber: checkNumber ?? null,
          referenceNumber: referenceNumber ?? null,
          fundId: fundId ?? null,
          bankAccountId: bankAccountId ?? null,
          donorName: donorName !== undefined ? (donorName || null) : undefined,
          functionalType: isSplit ? null : (functionalType ?? null),
          transactionFingerprint: newFingerprint,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, req.params.id))
        .returning();
      await trx.delete(transactionSplits).where(eq(transactionSplits.transactionId, row.id));
      if (isSplit) {
        for (let i = 0; i < rawSplits.length; i++) {
          const s = rawSplits[i];
          await trx.insert(transactionSplits).values({
            transactionId: row.id,
            companyId,
            chartAccountId: s.chartAccountId ?? null,
            vendorId: s.vendorId ?? null,
            amount: s.amount,
            memo: s.memo ?? null,
            functionalType: s.functionalType ?? null,
            sortOrder: s.sortOrder ?? i,
          });
        }
      }
      return row;
    });

    // Regenerate GL entries to reflect changes
    await generateGlEntries(updated.id, companyId).catch((e) =>
      console.error("[GL] update error:", e)
    );

    const donorLines = rawDonorLines ?? [];
    if (showDonorSplit && Array.isArray(donorLines) && donorLines.length > 0) {
      await db
        .delete(donations)
        .where(and(eq(donations.companyId, companyId), eq(donations.transactionId, updated.id)));
      for (const d of donorLines) {
        if (!d?.donorName || d.amount === undefined || d.amount === "") continue;
        const amt = parseFloat(String(d.amount));
        if (Number.isNaN(amt)) continue;
        await db.insert(donations).values({
          companyId,
          donorName: String(d.donorName),
          amount: amt,
          date: updated.date,
          fundId: d.fundId || null,
          notes: d.memo ? String(d.memo) : null,
          transactionId: updated.id,
          type: "CASH",
        });
      }
    }

    // Keep bank account balance in sync (handle bank account change)
    recomputeBankBalance(updated.bankAccountId, companyId).catch((e) =>
      console.error("[Balance] update sync error:", e)
    );
    if (existing.bankAccountId && existing.bankAccountId !== updated.bankAccountId) {
      recomputeBankBalance(existing.bankAccountId, companyId).catch((e) =>
        console.error("[Balance] old-bank sync error:", e)
      );
    }

    const { id: userId2, email: userEmail2, name: userName2 } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId: userId2,
      userEmail: userEmail2,
      userName: userName2,
      action: "UPDATE",
      entityType: "TRANSACTION",
      entityId: updated.id,
      description: `Updated transaction: ${updated.payee} $${updated.amount.toFixed(2)}`,
      oldValue: snap(existing as any),
      newValue: snap(updated as any),
    });

    const lookups = await getLookups(companyId);
    const splits = isSplit ? await loadSplitRowsByTransactionIds([updated.id]) : [];

    res.json(serializeTx(updated, splits, lookups));
  } catch (err) {
    console.error("Update transaction error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /transactions/:id (soft-void) ──────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    // Period-close protection
    const closedUntil = await getClosedUntil(companyId);
    if (isInClosedPeriod(existing.date, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntilLabel(closedUntil)}. Reopen the period to delete this transaction.`,
        code: "PERIOD_LOCKED",
      });
    }

    const [updated] = await db
      .update(transactions)
      .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    // Void the GL entries for this transaction
    voidGlEntries(req.params.id, companyId).catch((e) =>
      console.error("[GL] void error:", e)
    );
    // Keep bank account balance in sync
    recomputeBankBalance(existing.bankAccountId, companyId).catch((e) =>
      console.error("[Balance] delete sync error:", e)
    );

    const { id: userId3, email: userEmail3, name: userName3 } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId: userId3,
      userEmail: userEmail3,
      userName: userName3,
      action: "VOID",
      entityType: "TRANSACTION",
      entityId: existing.id,
      description: `Voided transaction: ${existing.payee} $${existing.amount.toFixed(2)} on ${formatTxIso(existing.date).slice(0, 10)}`,
      oldValue: snap(existing as any),
      newValue: { isVoid: true, status: "VOID" },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /transactions/:id/status ────────────────────────────────────────────
router.patch("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { status } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status is required" });

    const [before] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));

    const [updated] = await db
      .update(transactions)
      .set({ status: status as any, updatedAt: new Date() })
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

    if (before) {
      const { id: userId4, email: userEmail4, name: userName4 } = (req as any).user;
      logAudit({
        req,
        companyId,
        userId: userId4,
        userEmail: userEmail4,
        userName: userName4,
        action: "UPDATE",
        entityType: "TRANSACTION",
        entityId: updated.id,
        description: `Status changed: ${updated.payee} — ${before.status} → ${status}`,
        oldValue: { status: before.status },
        newValue: { status },
      });
    }

    const lookups = await getLookups(companyId);
    const splits = await loadSplitRowsByTransactionIds([updated.id]);

    res.json(serializeTx(updated, splits, lookups));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
