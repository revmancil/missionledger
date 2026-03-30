import { Router } from "express";
import { db, users, companies, organizationUsers, pool } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword } from "../lib/auth";

const router = Router();

function mapLegacyRoleToUi(role: string | null | undefined): "PRIMARY_ADMIN" | "ADMIN" | "USER" | "BOARD" {
  if (role === "MASTER_ADMIN") return "PRIMARY_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "OFFICER") return "BOARD";
  return "USER";
}

function mapUiRoleToLegacy(role: string | null | undefined): "MASTER_ADMIN" | "ADMIN" | "VIEWER" | "OFFICER" {
  if (role === "PRIMARY_ADMIN") return "MASTER_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "BOARD") return "OFFICER";
  return "VIEWER";
}

async function isPrimaryAdmin(userId: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationUsers.id })
    .from(organizationUsers)
    .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.companyId, companyId), eq(organizationUsers.isPrimary, true)))
    .limit(1);
  return !!row;
}

async function countPrimaryAdmins(companyId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM organization_users WHERE company_id = $1 AND is_primary = true AND is_active = true`,
    [companyId]
  );
  return parseInt(rows[0]?.cnt ?? "0", 10);
}

// ── GET /users/me ─────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { id: userId, companyId, email, role } = (req as any).user;
    const [u] = await db.select({
      id: users.id, name: users.name, email: users.email,
      role: users.role, isActive: users.isActive,
    }).from(users).where(and(eq(users.id, userId), eq(users.companyId, companyId)));
    if (!u) return res.status(404).json({ error: "User not found" });
    const [company] = await db.select({
      id: companies.id,
      companyCode: companies.companyCode,
      name: companies.name,
    }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const primary = await isPrimaryAdmin(userId, companyId);
    res.json({
      ...u,
      role: u.role ?? role,
      uiRole: primary ? "PRIMARY_ADMIN" : mapLegacyRoleToUi(u.role ?? role),
      isPrimaryAdmin: primary,
      companyId,
      companyCode: company?.companyCode ?? "",
      companyName: company?.name ?? "",
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.updated_at,
         COALESCE(ou.is_primary, false) AS is_primary
       FROM users u
       LEFT JOIN organization_users ou
         ON ou.user_id = u.id
        AND ou.company_id = $1
       WHERE u.company_id = $1
       ORDER BY ou.is_primary DESC, u.created_at ASC`,
      [companyId]
    );
    res.json(
      rows.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        uiRole: u.is_primary ? "PRIMARY_ADMIN" : mapLegacyRoleToUi(u.role),
        isPrimaryAdmin: !!u.is_primary,
        isActive: u.is_active,
        createdAt: new Date(u.created_at).toISOString(),
        updatedAt: new Date(u.updated_at).toISOString(),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, id: currentUserId } = (req as any).user;
    const { name, email, password, role } = req.body ?? {};
    if (!email || !password || !role) return res.status(400).json({ error: "Missing required fields" });
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const legacyRole = mapUiRoleToLegacy(role);
    if (legacyRole === "MASTER_ADMIN" && !requesterIsPrimary) {
      return res.status(403).json({ error: "Only the Primary Admin can create another Primary Admin." });
    }

    const hashed = await hashPassword(password);
    const [created] = await db.insert(users).values({
      companyId,
      name: name || null,
      email: email.toLowerCase(),
      password: hashed,
      role: legacyRole as any,
      isActive: true,
    }).returning();

    await db.insert(organizationUsers).values({
      userId: created.id,
      companyId,
      role: legacyRole as any,
      isPrimary: legacyRole === "MASTER_ADMIN",
      isActive: true,
    }).onConflictDoNothing();

    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      uiRole: legacyRole === "MASTER_ADMIN" ? "PRIMARY_ADMIN" : mapLegacyRoleToUi(legacyRole),
      isPrimaryAdmin: legacyRole === "MASTER_ADMIN",
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
    const { companyId, id: currentUserId } = (req as any).user;
    const { name, email, password, role, isActive } = req.body ?? {};
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const targetIsPrimary = await isPrimaryAdmin(req.params.id, companyId);
    const legacyRole = role ? mapUiRoleToLegacy(role) : undefined;

    if (targetIsPrimary && !requesterIsPrimary) {
      return res.status(403).json({ error: "Only the Primary Admin can modify another Primary Admin." });
    }
    if (targetIsPrimary && legacyRole && legacyRole !== "MASTER_ADMIN") {
      return res.status(400).json({ error: "Use 'Make Primary Admin' transfer to change Primary Admin ownership." });
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name || null;
    if (legacyRole) updateData.role = legacyRole;
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (email) updateData.email = email.toLowerCase();
    if (password) updateData.password = await hashPassword(password);

    const [updated] = await db.update(users).set(updateData)
      .where(and(eq(users.id, req.params.id), eq(users.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    if (legacyRole) {
      await db.update(organizationUsers).set({ role: legacyRole as any })
        .where(and(eq(organizationUsers.userId, updated.id), eq(organizationUsers.companyId, companyId)));
    }

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      uiRole: targetIsPrimary ? "PRIMARY_ADMIN" : mapLegacyRoleToUi(updated.role),
      isPrimaryAdmin: targetIsPrimary,
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
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const targetIsPrimary = await isPrimaryAdmin(req.params.id, companyId);
    if (targetIsPrimary && !requesterIsPrimary) {
      return res.status(403).json({ error: "Only a Primary Admin can delete a Primary Admin." });
    }
    if (targetIsPrimary) {
      const count = await countPrimaryAdmins(companyId);
      if (count <= 1) {
        return res.status(400).json({ error: "This is the only Primary Admin. Assign a new Primary Admin first." });
      }
    }
    await db.delete(organizationUsers).where(and(eq(organizationUsers.userId, req.params.id), eq(organizationUsers.companyId, companyId)));
    await db.delete(users).where(and(eq(users.id, req.params.id), eq(users.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/make-primary", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, id: currentUserId } = (req as any).user;
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    if (!requesterIsPrimary) {
      return res.status(403).json({ error: "Only the current Primary Admin can designate a new Primary Admin." });
    }
    const targetUserId = req.params.id;
    const [target] = await db.select().from(users).where(and(eq(users.id, targetUserId), eq(users.companyId, companyId))).limit(1);
    if (!target) return res.status(404).json({ error: "User not found" });

    await db.update(organizationUsers).set({ isPrimary: false, role: "ADMIN" as any })
      .where(and(eq(organizationUsers.companyId, companyId), eq(organizationUsers.isPrimary, true)));
    await db.update(organizationUsers).set({ isPrimary: true, role: "MASTER_ADMIN" as any })
      .where(and(eq(organizationUsers.userId, targetUserId), eq(organizationUsers.companyId, companyId)));

    await db.update(users).set({ role: "ADMIN" as any }).where(eq(users.id, currentUserId));
    await db.update(users).set({ role: "MASTER_ADMIN" as any }).where(eq(users.id, targetUserId));

    res.json({ success: true, newPrimaryAdminUserId: targetUserId });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
