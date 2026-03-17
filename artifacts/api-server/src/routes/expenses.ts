import { Router } from "express";
import { db, expenses, funds, accounts, vendors } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(expenses).where(eq(expenses.companyId, companyId)).orderBy(desc(expenses.date));
    
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const allVendors = await db.select().from(vendors).where(eq(vendors.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));
    const vendorMap = Object.fromEntries(allVendors.map(v => [v.id, v]));

    const enriched = all.map(e => ({
      ...e,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      fund: e.fundId ? fundMap[e.fundId] || null : null,
      vendor: e.vendorId ? vendorMap[e.vendorId] || null : null,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { description, amount, date, category, fundId, accountId, cashAccountId, vendorId, notes } = req.body ?? {};
    if (!description || !amount || !date || !category) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [created] = await db.insert(expenses).values({
      companyId,
      description,
      amount: parseFloat(amount),
      date: new Date(date),
      category,
      fundId: fundId || null,
      accountId: accountId || null,
      cashAccountId: cashAccountId || null,
      vendorId: vendorId || null,
      notes: notes || null,
    }).returning();

    res.status(201).json({ ...created, date: created.date.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { description, amount, date, category, fundId, accountId, cashAccountId, vendorId, notes } = req.body ?? {};

    const [updated] = await db.update(expenses).set({
      description,
      amount: amount ? parseFloat(amount) : undefined,
      date: date ? new Date(date) : undefined,
      category,
      fundId: fundId || null,
      accountId: accountId || null,
      cashAccountId: cashAccountId || null,
      vendorId: vendorId || null,
      notes: notes || null,
      updatedAt: new Date(),
    }).where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, date: updated.date.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(expenses).where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
