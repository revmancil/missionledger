import { Router } from "express";
import {
  db, transactions, transactionSplits, chartOfAccounts,
  bankAccounts, funds, vendors,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries, voidGlEntries } from "../lib/gl";

const router = Router();

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
  rawSplits: Array<{ chartAccountId?: string | null; vendorId?: string | null; amount: number; memo?: string | null; sortOrder?: number }>
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

    res.json(all.map((tx) => serializeTx(tx, splitsByTx[tx.id] ?? [], lookups)));
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
      fundId, splits: rawSplits,
    } = req.body ?? {};

    if (!date || !payee || amount === undefined)
      return res.status(400).json({ error: "date, payee, and amount are required" });

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

    const [created] = await db
      .insert(transactions)
      .values({
        companyId,
        bankAccountId: bankAccountId ?? null,
        date: new Date(date),
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
      })
      .returning();

    if (isSplit) await upsertSplits(created.id, rawSplits);

    // Generate double-entry GL records (fire-and-forget, non-blocking to response)
    generateGlEntries(created.id, companyId).catch((e) =>
      console.error("[GL] create error:", e)
    );

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

// ── PUT /transactions/:id ─────────────────────────────────────────────────────
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      date, payee, vendorId, amount, type, status,
      chartAccountId, memo, checkNumber, referenceNumber,
      fundId, bankAccountId, splits: rawSplits,
    } = req.body ?? {};

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isVoid) return res.status(400).json({ error: "Cannot edit a voided transaction" });

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

    const [updated] = await db
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
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, req.params.id))
      .returning();

    await upsertSplits(updated.id, isSplit ? rawSplits : []);

    // Regenerate GL entries to reflect changes
    generateGlEntries(updated.id, companyId).catch((e) =>
      console.error("[GL] update error:", e)
    );

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

    const [updated] = await db
      .update(transactions)
      .set({ status: status as any, updatedAt: new Date() })
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });

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
