import { Router } from "express";
import { db, bankAccounts, bankTransactions } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId)).orderBy(bankAccounts.name);
    res.json(
      all.map((a) => ({
        ...a,
        createdAt: toIsoString(a.createdAt),
        updatedAt: toIsoString(a.updatedAt),
      })),
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, accountType, lastFour, currentBalance, glAccountId, isActive } = req.body ?? {};
    if (!name || !accountType) return res.status(400).json({ error: "Missing required fields" });

    const [created] = await db.insert(bankAccounts).values({
      companyId,
      name,
      accountType: accountType || "CHECKING",
      lastFour: lastFour || null,
      currentBalance: parseFloat(currentBalance) || 0,
      glAccountId: glAccountId || null,
      isActive: isActive !== false,
    }).returning();

    res.status(201).json({
      ...created,
      createdAt: toIsoString(created.createdAt),
      updatedAt: toIsoString(created.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, accountType, lastFour, currentBalance, glAccountId, isActive } = req.body ?? {};

    const [updated] = await db.update(bankAccounts).set({
      name,
      accountType,
      lastFour: lastFour || null,
      currentBalance: currentBalance !== undefined ? parseFloat(currentBalance) : undefined,
      glAccountId: glAccountId || null,
      isActive,
      updatedAt: new Date(),
    }).where(and(eq(bankAccounts.id, req.params.id), eq(bankAccounts.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      createdAt: toIsoString(updated.createdAt),
      updatedAt: toIsoString(updated.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(bankAccounts).where(and(eq(bankAccounts.id, req.params.id), eq(bankAccounts.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
