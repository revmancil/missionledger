import { Router } from "express";
import { db, budgets, budgetLines, accounts } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(budgets).where(eq(budgets.companyId, companyId)).orderBy(desc(budgets.fiscalYear));

    const allLines = await db.select().from(budgetLines).where(eq(budgetLines.companyId, companyId));

    const enriched = all.map(b => {
      const lines = allLines.filter(l => l.budgetId === b.id);
      const totalBudget = lines.reduce((s, l) => s + (l.amount || 0), 0);
      return {
        ...b,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        totalBudget,
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
    const { name, fiscalYear, startDate, endDate } = req.body ?? {};
    if (!name || !fiscalYear || !startDate || !endDate) return res.status(400).json({ error: "Missing required fields" });

    const [created] = await db.insert(budgets).values({
      companyId,
      name,
      fiscalYear: parseInt(fiscalYear),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true,
    }).returning();

    res.status(201).json({ ...created, startDate: created.startDate.toISOString(), endDate: created.endDate.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString(), totalBudget: 0 });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
