import { Router } from "express";
import { db, donors } from "@workspace/db";
import { eq, and, ilike, or } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

function serialize(d: typeof donors.$inferSelect) {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// GET /api/donor-directory?search=&activeOnly=true
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const activeOnly = req.query.activeOnly !== "false";

    const conditions = [eq(donors.companyId, companyId)];
    if (activeOnly) conditions.push(eq(donors.isActive, true));
    if (search) {
      conditions.push(or(ilike(donors.name, `%${search}%`), ilike(donors.email, `%${search}%`))!);
    }

    const rows = await db.select().from(donors).where(and(...conditions)).orderBy(donors.name).limit(50);
    res.json(rows.map(serialize));
  } catch (error) {
    console.error("List donor directory error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/donor-directory — create a new giver record
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email, phone, address, notes } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return void res.status(400).json({ error: "Name is required" });
    }

    const [created] = await db.insert(donors).values({
      companyId,
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
    }).returning();

    res.status(201).json(serialize(created));
  } catch (error) {
    console.error("Create donor directory entry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/donor-directory/resolve — find-or-create by name (case-insensitive
 * exact match), used by the giver combobox so selecting an existing name or
 * typing a brand-new one both resolve to a stable donorId in one call.
 */
router.post("/resolve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return void res.status(400).json({ error: "Name is required" });
    }
    const trimmedName = name.trim();

    const [existing] = await db
      .select()
      .from(donors)
      .where(and(eq(donors.companyId, companyId), ilike(donors.name, trimmedName)))
      .limit(1);

    if (existing) {
      // Fill in an email we didn't have before, but never overwrite one already on file.
      if (email && !existing.email) {
        const [updated] = await db.update(donors).set({ email, updatedAt: new Date() }).where(eq(donors.id, existing.id)).returning();
        return void res.json(serialize(updated));
      }
      return void res.json(serialize(existing));
    }

    const [created] = await db.insert(donors).values({
      companyId,
      name: trimmedName,
      email: email || null,
    }).returning();

    res.status(201).json(serialize(created));
  } catch (error) {
    console.error("Resolve donor directory entry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email, phone, address, notes, isActive } = req.body ?? {};

    const [updated] = await db.update(donors).set({
      name: name !== undefined ? name : undefined,
      email: email !== undefined ? (email || null) : undefined,
      phone: phone !== undefined ? (phone || null) : undefined,
      address: address !== undefined ? (address || null) : undefined,
      notes: notes !== undefined ? (notes || null) : undefined,
      isActive: isActive !== undefined ? !!isActive : undefined,
      updatedAt: new Date(),
    }).where(and(eq(donors.id, req.params.id), eq(donors.companyId, companyId))).returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(serialize(updated));
  } catch (error) {
    console.error("Update donor directory entry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Soft-delete only: deactivate rather than remove, since historical donations/pledges may reference it.
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [updated] = await db.update(donors)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(donors.id, req.params.id), eq(donors.companyId, companyId)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Deactivate donor directory entry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
