import { Router } from "express";
import { db, users } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).where(eq(users.companyId, companyId));
    res.json(all.map(u => ({ ...u, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email, password, role } = req.body ?? {};
    if (!email || !password || !role) return res.status(400).json({ error: "Missing required fields" });

    const hashed = await hashPassword(password);
    const [created] = await db.insert(users).values({
      companyId,
      name: name || null,
      email: email.toLowerCase(),
      password: hashed,
      role: role as any,
      isActive: true,
    }).returning();

    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, email, password, role, isActive } = req.body ?? {};

    const updateData: any = { name: name || null, role, isActive, updatedAt: new Date() };
    if (email) updateData.email = email.toLowerCase();
    if (password) updateData.password = await hashPassword(password);

    const [updated] = await db.update(users).set(updateData)
      .where(and(eq(users.id, req.params.id), eq(users.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, id: currentUserId } = (req as any).user;
    if (req.params.id === currentUserId) return res.status(400).json({ error: "Cannot delete yourself" });
    await db.delete(users).where(and(eq(users.id, req.params.id), eq(users.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
