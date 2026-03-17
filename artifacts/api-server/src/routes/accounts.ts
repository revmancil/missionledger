import { Router } from "express";
import { db, accounts, journalEntryLines } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(accounts).where(eq(accounts.companyId, companyId)).orderBy(accounts.code);

    // Calculate balances from journal entry lines
    const lines = await db.select().from(journalEntryLines).where(eq(journalEntryLines.companyId, companyId));
    const balanceMap: Record<string, number> = {};
    for (const line of lines) {
      if (!balanceMap[line.accountId]) balanceMap[line.accountId] = 0;
      balanceMap[line.accountId] += (line.debit || 0) - (line.credit || 0);
    }

    const enriched = all.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      balance: balanceMap[a.id] || 0,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { code, name, type, description, isActive, parentId } = req.body ?? {};
    if (!code || !name || !type) return res.status(400).json({ error: "Code, name, and type are required" });

    // Check for duplicate code
    const existing = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.code, code))).limit(1);
    if (existing.length) return res.status(400).json({ error: "Account code already exists" });

    const [created] = await db.insert(accounts).values({
      companyId,
      code,
      name,
      type: type as any,
      description: description || null,
      isActive: isActive !== false,
      parentId: parentId || null,
    }).returning();

    res.status(201).json({ ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString(), balance: 0 });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { code, name, type, description, isActive, parentId } = req.body ?? {};

    const [updated] = await db.update(accounts).set({
      code,
      name,
      type: type as any,
      description: description || null,
      isActive,
      parentId: parentId || null,
      updatedAt: new Date(),
    }).where(and(eq(accounts.id, req.params.id), eq(accounts.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), balance: 0 });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(accounts).where(and(eq(accounts.id, req.params.id), eq(accounts.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
