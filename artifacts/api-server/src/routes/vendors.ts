import { Router } from "express";
import { db, vendors } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(vendors).where(eq(vendors.companyId, companyId)).orderBy(vendors.name);
    res.json(
      all.map((v) => ({
        ...v,
        createdAt: toIsoString(v.createdAt),
        updatedAt: toIsoString(v.updatedAt),
      })),
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email, phone, address, taxId, isActive } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [created] = await db.insert(vendors).values({
      companyId,
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      taxId: taxId || null,
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
    const { name, email, phone, address, taxId, isActive } = req.body ?? {};

    const [updated] = await db.update(vendors).set({
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      taxId: taxId || null,
      isActive,
      updatedAt: new Date(),
    }).where(and(eq(vendors.id, req.params.id), eq(vendors.companyId, companyId))).returning();

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
    await db.delete(vendors).where(and(eq(vendors.id, req.params.id), eq(vendors.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
