import { Router } from "express";
import { db, transactions, chartOfAccounts, bankAccounts, funds } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

async function enrichTransaction(tx: any, companyId: string) {
  const allCoa = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId));
  const allFunds = await db
    .select()
    .from(funds)
    .where(eq(funds.companyId, companyId));
  const allBankAccounts = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.companyId, companyId));

  const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const fundMap = Object.fromEntries(allFunds.map((f) => [f.id, f]));
  const bankMap = Object.fromEntries(allBankAccounts.map((b) => [b.id, b]));

  return {
    ...tx,
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : tx.updatedAt,
    chartAccount: tx.chartAccountId ? coaMap[tx.chartAccountId] ?? null : null,
    fund: tx.fundId ? fundMap[tx.fundId] ?? null : null,
    bankAccount: tx.bankAccountId ? bankMap[tx.bankAccountId] ?? null : null,
  };
}

// GET /transactions?bankAccountId=&status=
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, status } = req.query;

    const all = await db
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, companyId))
      .orderBy(desc(transactions.date), desc(transactions.createdAt));

    const filtered = all.filter((t) => {
      if (bankAccountId && t.bankAccountId !== bankAccountId) return false;
      if (status && t.status !== status) return false;
      return true;
    });

    // Bulk-enrich (fetch lookup data once)
    const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const allBanks = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId));
    const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
    const fundMap = Object.fromEntries(allFunds.map((f) => [f.id, f]));
    const bankMap = Object.fromEntries(allBanks.map((b) => [b.id, b]));

    res.json(
      filtered.map((t) => ({
        ...t,
        date: t.date.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        chartAccount: t.chartAccountId ? coaMap[t.chartAccountId] ?? null : null,
        fund: t.fundId ? fundMap[t.fundId] ?? null : null,
        bankAccount: t.bankAccountId ? bankMap[t.bankAccountId] ?? null : null,
      }))
    );
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /transactions
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      bankAccountId,
      date,
      payee,
      amount,
      type,
      status,
      chartAccountId,
      memo,
      checkNumber,
      referenceNumber,
      fundId,
    } = req.body ?? {};

    if (!date || !payee || amount === undefined)
      return res.status(400).json({ error: "date, payee, and amount are required" });

    const [created] = await db
      .insert(transactions)
      .values({
        companyId,
        bankAccountId: bankAccountId ?? null,
        date: new Date(date),
        payee,
        amount: parseFloat(amount),
        type: (type as any) ?? "DEBIT",
        status: (status as any) ?? "UNCLEARED",
        chartAccountId: chartAccountId ?? null,
        memo: memo ?? null,
        checkNumber: checkNumber ?? null,
        referenceNumber: referenceNumber ?? null,
        fundId: fundId ?? null,
        isVoid: false,
      })
      .returning();

    res.status(201).json(await enrichTransaction(created, companyId));
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /transactions/:id
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      date,
      payee,
      amount,
      type,
      status,
      chartAccountId,
      memo,
      checkNumber,
      referenceNumber,
      fundId,
      bankAccountId,
    } = req.body ?? {};

    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.isVoid) return res.status(400).json({ error: "Cannot edit a voided transaction" });

    const [updated] = await db
      .update(transactions)
      .set({
        date: date ? new Date(date) : undefined,
        payee: payee ?? undefined,
        amount: amount !== undefined ? parseFloat(amount) : undefined,
        type: (type as any) ?? undefined,
        status: (status as any) ?? undefined,
        chartAccountId: chartAccountId ?? null,
        memo: memo ?? null,
        checkNumber: checkNumber ?? null,
        referenceNumber: referenceNumber ?? null,
        fundId: fundId ?? null,
        bankAccountId: bankAccountId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, req.params.id))
      .returning();

    res.json(await enrichTransaction(updated, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /transactions/:id  (soft-void, not hard delete)
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [updated] = await db
      .update(transactions)
      .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
      .where(and(eq(transactions.id, req.params.id), eq(transactions.companyId, companyId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /transactions/:id/status  (toggle cleared/uncleared)
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
    res.json(await enrichTransaction(updated, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
