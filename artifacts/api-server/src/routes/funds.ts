import { Router } from "express";
import { db, funds, donations, expenses } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(funds).where(eq(funds.companyId, companyId)).orderBy(desc(funds.createdAt));

    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    const enriched = all.map(fund => {
      const fundDonations = allDonations.filter(d => d.fundId === fund.id);
      const fundExpenses = allExpenses.filter(e => e.fundId === fund.id);
      const totalDonations = fundDonations.reduce((s, d) => s + (d.amount || 0), 0);
      const totalExpenses = fundExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      return {
        ...fund,
        createdAt: fund.createdAt.toISOString(),
        updatedAt: fund.updatedAt.toISOString(),
        balance: totalDonations - totalExpenses,
        totalDonations,
        totalExpenses,
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundType, isActive } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [created] = await db.insert(funds).values({
      companyId,
      name,
      description: description || null,
      fundType: fundType || "UNRESTRICTED",
      isActive: isActive !== false,
    }).returning();

    res.status(201).json({ ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundType, isActive } = req.body ?? {};

    const [updated] = await db.update(funds).set({
      name,
      description: description || null,
      fundType: fundType || "UNRESTRICTED",
      isActive,
      updatedAt: new Date(),
    }).where(and(eq(funds.id, req.params.id), eq(funds.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(funds).where(and(eq(funds.id, req.params.id), eq(funds.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
