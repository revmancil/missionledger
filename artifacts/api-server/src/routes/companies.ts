import { Router } from "express";
import { db, companies, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "Not found" });
    res.json({ ...company, createdAt: company.createdAt.toISOString(), updatedAt: company.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, dba, ein, address, phone, email } = req.body ?? {};

    const [updated] = await db.update(companies).set({
      name,
      dba: dba || null,
      ein: ein || undefined,
      address: address || null,
      phone: phone || null,
      email: email || null,
      updatedAt: new Date(),
    }).where(eq(companies.id, companyId)).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
