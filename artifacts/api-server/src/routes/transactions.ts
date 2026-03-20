import { Router } from "express";
import {
  db, transactions, transactionSplits, chartOfAccounts,
  bankAccounts, funds, vendors, companies, journalEntryLines,
} from "@workspace/db";
import { eq, and, desc, inArray, sql, ne } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries, voidGlEntries } from "../lib/gl";
import { logAudit, snap } from "../lib/audit";

/** Recompute a bank account's currentBalance from all its non-void transactions. */
async function recomputeBankBalance(bankAccountId: string | null | undefined, companyId: string): Promise<void> {
  if (!bankAccountId) return;
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS balance
    FROM transactions
    WHERE bank_account_id = ${bankAccountId}
      AND company_id = ${companyId}
      AND is_void = false
  `);
  const balance = parseFloat((result.rows[0] as any)?.balance ?? "0") || 0;
  await db.update(bankAccounts)
    .set({ currentBalance: balance, updatedAt: new Date() })
    .where(eq(bankAccounts.id, bankAccountId));
}

async function getClosedUntil(companyId: string): Promise<Date | null> {
  const [co] = await db.select({ closedUntil: companies.closedUntil }).from(companies).where(eq(companies.id, companyId));
  return co?.closedUntil ?? null;
}

function isInClosedPeriod(txDate: Date | string, closedUntil: Date | null): boolean {
  if (!closedUntil) return false;
  const d = txDate instanceof Date ? txDate : new Date(txDate);
  return d <= closedUntil;
}

const router = Router();

// ── Fingerprint helpers ────────────────────────────────────────────────────────
/** Builds a stable duplicate-detection key: "{amount}_{YYYY-MM-DD}_{payee}" */
function buildFingerprint(amount: number, date: Date | string, payee: string): string {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().substring(0, 10);
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

function serializeTx(
  tx: any,
  splits: any[],
  lookups: Awaited<ReturnType<typeof getLookups>>
) {
  const { coaMap, fundMap, bankMap, vendorMap } = lookups;
  return {
    ...tx,
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
    chartAccount: tx.chartAccountId ? coaMap[tx.chartAccountId] ?? null : null,
    fund: tx.fundId ? fundMap[tx.fundId] ?? null : null,
    bankAccount: tx.bankAccountId ? bankMap[tx.bankAccountId] ?? null : null,
    vendor: tx.vendorId ? vendorMap[tx.vendorId] ?? null : null,
    splits: splits.map((s) => ({
      ...s,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
      chartAccount: s.chartAccountId ? coaMap[s.chartAccountId] ?? null : null,
      vendor: s.vendorId ? vendorMap[s.vendorId] ?? null : null,
    })),
  };
}

async function upsertSplits(
  transactionId: string,
  rawSplits: Array<{ chartAccountId?: string | null; vendorId?: string | null; amount: number; memo?: string | null; functionalType?: string | null; sortOrder?: number }>
) {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId));
  if (rawSplits.length === 0) return;
  for (let i = 0; i < rawSplits.length; i++) {
    const s = rawSplits[i];
    await db.insert(transactionSplits).values({
      transactionId,
      chartAccountId: s.chartAccountId ?? null,
      vendorId: s.vendorId ?? null,
      amount: s.amount,
      memo: s.memo ?? null,
      functionalType: s.functionalType ?? null,
      sortOrder: s.sortOrder ?? i,
    });
  }
}

// ── GET /transactions ─────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, status } = req.query;

    let all = await db
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, companyId))
      .orderBy(desc(transactions.date), desc(transactions.createdAt));

    if (bankAccountId) all = all.filter((t) => t.bankAccountId === bankAccountId);
    if (status) all = all.filter((t) => t.status === status);

    const txIds = all.map((t) => t.id);
    let allSplits: any[] = [];
    if (txIds.length) {
      allSplits = await db
        .select()
        .from(transactionSplits)
        .where(inArray(transactionSplits.transactionId, txIds))
        .orderBy(transactionSplits.transactionId, transactionSplits.sortOrder);
    }

    const splitsByTx = allSplits.reduce<Record<string, any[]>>((acc, s) => {
      (acc[s.transactionId] ??= []).push(s);
      return acc;
    }, {});

    const lookups = await getLookups(companyId);
    const closedUntil = await getClosedUntil(companyId);

    res.json({
      closedUntil: closedUntil ? closedUntil.toISOString() : null,
      transactions: all.map((tx) => ({
        ...serializeTx(tx, splitsByTx[tx.id] ?? [], lookups),
        isClosed: isInClosedPeriod(tx.date, closedUntil),
      })),
    });
  } catch (err) {
    console.error("Get transactions error:", err);
    res.status(500).json({ error: "Internal server error" });
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
      fundId, splits: rawSplits, functionalType,
    } = req.body ?? {};

    if (!date || !payee || amount === undefined)
      return res.status(400).json({ error: "date, payee, and amount are required" });

    // Period-close protection
    const closedUntil = await getClosedUntil(companyId);
    if (isInClosedPeriod(date, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntil!.toISOString().substring(0, 10)}. Reopen the period before adding transactions.`,
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
    const txDate = new Date(date);
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

    // Generate double-entry GL records (fire-and-forget, non-blocking to response)
    generateGlEntries(created.id, companyId).catch((e) =>
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
      description: `Created transaction: ${created.payee} $${created.amount.toFixed(2)} on ${created.date instanceof Date ? created.date.toISOString().substring(0, 10) : created.date}`,
      newValue: snap(created as any),
    });

    const lookups = await getLookups(companyId);
    const splits = isSplit
      ? await db.select().from(transactionSplits).where(eq(transactionSplits.transactionId, created.id)).orderBy(transactionSplits.sortOrder)
      : [];

    res.status(201).json(serializeTx(created, splits, lookups));
  } catch (err) {
    console.error("Create transaction error:", err);
    res.status(500).json({ error: "Internal server error" });
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
          account: coaMap[l.accountId] ?? null,
          fund: l.fundId ? (fundMap[l.fundId] ?? null) : null,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          memo: l.description ?? null,
        })),
      });
    }

    // Otherwise return regular transaction splits
    const splits = await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, tx.id))
      .orderBy(transactionSplits.sortOrder);

    return res.json({
      transactionId: tx.id,
      journalEntryId: null,
      source: "TRANSACTION_SPLIT",
      splits: splits.map((s) => ({
        id: s.id,
        account: s.chartAccountId ? (coaMap[s.chartAccountId] ?? null) : null,
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
      fundId, bankAccountId, splits: rawSplits, functionalType,
    } = req.body ?? {};

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isVoid) return res.status(400).json({ error: "Cannot edit a voided transaction" });

    // Period-close protection
    const closedUntil = await getClosedUntil(companyId);
    const effectiveDate = date ? new Date(date) : existing.date;
    if (isInClosedPeriod(existing.date, closedUntil) || isInClosedPeriod(effectiveDate, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntil!.toISOString().substring(0, 10)}. Reopen the period to edit this transaction.`,
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
    const effectiveDateVal = date ? new Date(date) : existing.date;
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
          date: date ? new Date(date) : undefined,
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
    generateGlEntries(updated.id, companyId).catch((e) =>
      console.error("[GL] update error:", e)
    );
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
    const splits = isSplit
      ? await db.select().from(transactionSplits).where(eq(transactionSplits.transactionId, updated.id)).orderBy(transactionSplits.sortOrder)
      : [];

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
        error: `This period is locked through ${closedUntil!.toISOString().substring(0, 10)}. Reopen the period to delete this transaction.`,
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
      description: `Voided transaction: ${existing.payee} $${existing.amount.toFixed(2)} on ${existing.date instanceof Date ? existing.date.toISOString().substring(0, 10) : existing.date}`,
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
    const splits = await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, updated.id))
      .orderBy(transactionSplits.sortOrder);

    res.json(serializeTx(updated, splits, lookups));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
