import { Router } from "express";
import { db, pledgeCampaigns, pledges } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { foreignIdError } from "../lib/ownership";

const router = Router();

function serialize(c: typeof pledgeCampaigns.$inferSelect) {
  return {
    ...c,
    startDate: c.startDate?.toISOString() || null,
    endDate: c.endDate?.toISOString() || null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/pledge-campaigns — list with pledged/collected progress against each goal
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const campaigns = await db.select().from(pledgeCampaigns).where(eq(pledgeCampaigns.companyId, companyId));
    const allPledges = await db.select().from(pledges).where(eq(pledges.companyId, companyId));

    const result = campaigns.map((c) => {
      const linked = allPledges.filter((p) => p.campaignId === c.id);
      const pledgedTotal = linked.reduce((s, p) => s + (p.totalAmount || 0), 0);
      const collectedTotal = linked.reduce((s, p) => s + (p.paidAmount || 0), 0);
      return {
        ...serialize(c),
        pledgeCount: linked.length,
        pledgedTotal,
        collectedTotal,
        percentOfGoal: c.goalAmount > 0 ? Math.round((pledgedTotal / c.goalAmount) * 1000) / 10 : 0,
      };
    });

    res.json(result.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)));
  } catch (error) {
    console.error("List pledge campaigns error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundId, goalAmount, startDate, endDate } = req.body ?? {};
    {
      const bad = await foreignIdError(companyId, { fund: fundId });
      if (bad) return void res.status(400).json({ error: bad });
    }
    if (!name || !goalAmount) return void res.status(400).json({ error: "Name and goal amount are required" });

    const [created] = await db.insert(pledgeCampaigns).values({
      companyId,
      name,
      description: description || null,
      fundId: fundId || null,
      goalAmount: parseFloat(goalAmount),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    }).returning();

    res.status(201).json(serialize(created));
  } catch (error) {
    console.error("Create pledge campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundId, goalAmount, startDate, endDate, isActive } = req.body ?? {};
    {
      const bad = await foreignIdError(companyId, { fund: fundId });
      if (bad) return void res.status(400).json({ error: bad });
    }

    const [updated] = await db.update(pledgeCampaigns).set({
      name: name !== undefined ? name : undefined,
      description: description !== undefined ? (description || null) : undefined,
      fundId: fundId !== undefined ? (fundId || null) : undefined,
      goalAmount: goalAmount !== undefined ? parseFloat(goalAmount) : undefined,
      startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
      endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
      isActive: isActive !== undefined ? !!isActive : undefined,
      updatedAt: new Date(),
    }).where(and(eq(pledgeCampaigns.id, req.params.id), eq(pledgeCampaigns.companyId, companyId))).returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(serialize(updated));
  } catch (error) {
    console.error("Update pledge campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete only if no pledges are linked — otherwise require unlinking/deactivating first.
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [campaign] = await db.select({ id: pledgeCampaigns.id }).from(pledgeCampaigns)
      .where(and(eq(pledgeCampaigns.id, req.params.id), eq(pledgeCampaigns.companyId, companyId)))
      .limit(1);
    if (!campaign) return void res.status(404).json({ error: "Not found" });

    const [linkedPledge] = await db.select({ id: pledges.id }).from(pledges)
      .where(and(eq(pledges.campaignId, campaign.id), eq(pledges.companyId, companyId)))
      .limit(1);
    if (linkedPledge) {
      return void res.status(400).json({ error: "This campaign has pledges linked to it. Deactivate it instead, or remove the pledges first." });
    }

    await db.delete(pledgeCampaigns).where(eq(pledgeCampaigns.id, campaign.id));
    res.json({ success: true });
  } catch (error) {
    console.error("Delete pledge campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
