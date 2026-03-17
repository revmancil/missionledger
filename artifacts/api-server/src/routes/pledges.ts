import { Router } from "express";
import { db, pledges } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(pledges).where(eq(pledges.companyId, companyId)).orderBy(desc(pledges.pledgeDate));
    res.json(all.map(p => ({
      ...p,
      pledgeDate: p.pledgeDate.toISOString(),
      startDate: p.startDate?.toISOString() || null,
      endDate: p.endDate?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      remainingAmount: (p.totalAmount || 0) - (p.paidAmount || 0),
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { donorName, donorEmail, totalAmount, pledgeDate, startDate, endDate, frequency, fundId, notes } = req.body ?? {};
    if (!donorName || !totalAmount || !pledgeDate) return res.status(400).json({ error: "Missing required fields" });

    const [created] = await db.insert(pledges).values({
      companyId,
      donorName,
      donorEmail: donorEmail || null,
      totalAmount: parseFloat(totalAmount),
      paidAmount: 0,
      pledgeDate: new Date(pledgeDate),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      frequency: frequency as any || null,
      fundId: fundId || null,
      status: "ACTIVE",
      notes: notes || null,
    }).returning();

    res.status(201).json({
      ...created,
      pledgeDate: created.pledgeDate.toISOString(),
      startDate: created.startDate?.toISOString() || null,
      endDate: created.endDate?.toISOString() || null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      remainingAmount: created.totalAmount,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { donorName, donorEmail, totalAmount, pledgeDate, startDate, endDate, frequency, fundId, status, notes } = req.body ?? {};

    const [updated] = await db.update(pledges).set({
      donorName,
      donorEmail: donorEmail || null,
      totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
      pledgeDate: pledgeDate ? new Date(pledgeDate) : undefined,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      frequency: frequency as any || null,
      fundId: fundId || null,
      status: status as any,
      notes: notes || null,
      updatedAt: new Date(),
    }).where(and(eq(pledges.id, req.params.id), eq(pledges.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      pledgeDate: updated.pledgeDate.toISOString(),
      startDate: updated.startDate?.toISOString() || null,
      endDate: updated.endDate?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      remainingAmount: (updated.totalAmount || 0) - (updated.paidAmount || 0),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(pledges).where(and(eq(pledges.id, req.params.id), eq(pledges.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
