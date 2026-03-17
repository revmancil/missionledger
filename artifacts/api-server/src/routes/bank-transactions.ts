import { Router } from "express";
import { db, bankTransactions, accounts, funds } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, status } = req.query;
    
    let query = db.select().from(bankTransactions).where(eq(bankTransactions.companyId, companyId));
    const all = await db.select().from(bankTransactions)
      .where(eq(bankTransactions.companyId, companyId))
      .orderBy(desc(bankTransactions.date));

    const filtered = all.filter(t => {
      if (bankAccountId && t.bankAccountId !== bankAccountId) return false;
      if (status && t.status !== status) return false;
      return true;
    });

    const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

    res.json(filtered.map(t => ({
      ...t,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      account: t.accountId ? accountMap[t.accountId] || null : null,
      fund: t.fundId ? fundMap[t.fundId] || null : null,
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, date, description, merchantName, amount, type } = req.body ?? {};
    if (!bankAccountId || !date || !description || !amount || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [created] = await db.insert(bankTransactions).values({
      companyId,
      bankAccountId,
      date: new Date(date),
      description,
      merchantName: merchantName || null,
      amount: parseFloat(amount),
      type: type as any,
      status: "PENDING",
    }).returning();

    res.status(201).json({ ...created, date: created.date.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { description, merchantName, fundId, accountId, status } = req.body ?? {};

    const [updated] = await db.update(bankTransactions).set({
      description,
      merchantName: merchantName || null,
      fundId: fundId || null,
      accountId: accountId || null,
      status: status as any,
      updatedAt: new Date(),
    }).where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, date: updated.date.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(bankTransactions).where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/categorize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { accountId, fundId, description } = req.body ?? {};
    if (!accountId) return res.status(400).json({ error: "Account is required" });

    const [updated] = await db.update(bankTransactions).set({
      accountId,
      fundId: fundId || null,
      description: description || undefined,
      status: "POSTED",
      updatedAt: new Date(),
    }).where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, date: updated.date.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
