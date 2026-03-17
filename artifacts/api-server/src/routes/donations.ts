import { Router } from "express";
import { db, donations, funds, accounts } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(donations).where(eq(donations.companyId, companyId)).orderBy(desc(donations.date));
    
    // Enrich with fund and account names
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));
    const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));

    const enriched = all.map(d => ({
      ...d,
      date: d.date.toISOString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      fund: d.fundId ? fundMap[d.fundId] || null : null,
      account: d.accountId ? accountMap[d.accountId] || null : null,
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Get donations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [donation] = await db.select().from(donations).where(
      and(eq(donations.id, req.params.id), eq(donations.companyId, companyId))
    );
    if (!donation) return res.status(404).json({ error: "Not found" });
    res.json({ ...donation, date: donation.date.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { donorName, donorEmail, amount, date, type, fundId, accountId, cashAccountId, notes } = req.body ?? {};
    if (!donorName || !amount || !date || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [created] = await db.insert(donations).values({
      companyId,
      donorName,
      donorEmail: donorEmail || null,
      amount: parseFloat(amount),
      date: new Date(date),
      type: type as any,
      fundId: fundId || null,
      accountId: accountId || null,
      cashAccountId: cashAccountId || null,
      notes: notes || null,
    }).returning();

    res.status(201).json({ ...created, date: created.date.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
  } catch (error) {
    console.error("Create donation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { donorName, donorEmail, amount, date, type, fundId, accountId, cashAccountId, notes } = req.body ?? {};

    const [updated] = await db.update(donations).set({
      donorName,
      donorEmail: donorEmail || null,
      amount: amount ? parseFloat(amount) : undefined,
      date: date ? new Date(date) : undefined,
      type: type as any,
      fundId: fundId || null,
      accountId: accountId || null,
      cashAccountId: cashAccountId || null,
      notes: notes || null,
      updatedAt: new Date(),
    }).where(and(eq(donations.id, req.params.id), eq(donations.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, date: updated.date.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(donations).where(and(eq(donations.id, req.params.id), eq(donations.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
