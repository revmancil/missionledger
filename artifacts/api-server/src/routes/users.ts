import { Router } from "express";
import { db, users, companies, organizationUsers, pool } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, hashPassword, comparePassword } from "../lib/auth";
import { isEmailConfigured, sendTeamMemberWelcomeEmail, sendSecurityNoticeEmail } from "../lib/email";
import { logAudit } from "../lib/audit";
import { passwordPolicyError } from "../lib/password";
import { getPublicFrontendBase } from "../lib/frontendUrl";

const router = Router();

function assertExpectedCompany(req: any, actualCompanyId: string): string | null {
  const expectedRaw = req.headers["x-company-id-expected"];
  const expected = Array.isArray(expectedRaw) ? expectedRaw[0] : expectedRaw;
  if (!expected) return null;
  if (String(expected) !== String(actualCompanyId)) {
    return "Company context mismatch. Refresh and retry in the correct organization.";
  }
  return null;
}

function mapLegacyRoleToUi(role: string | null | undefined): "PRIMARY_ADMIN" | "ADMIN" | "USER" | "BOARD" | "PASTOR" {
  if (role === "MASTER_ADMIN") return "PRIMARY_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "OFFICER") return "BOARD";
  if (role === "PASTOR") return "PASTOR";
  return "USER";
}

function mapUiRoleToLegacy(role: string | null | undefined): "MASTER_ADMIN" | "ADMIN" | "VIEWER" | "OFFICER" | "PASTOR" {
  if (role === "PRIMARY_ADMIN") return "MASTER_ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "BOARD") return "OFFICER";
  if (role === "PASTOR") return "PASTOR";
  return "VIEWER";
}

async function isPrimaryAdmin(userId: string, companyId: string): Promise<boolean> {
  // Primary check: explicit isPrimary flag in organization_users
  const [ouRow] = await db
    .select({ id: organizationUsers.id })
    .from(organizationUsers)
    .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.companyId, companyId), eq(organizationUsers.isPrimary, true)))
    .limit(1);
  if (ouRow) return true;

  // Fallback: users.role = 'MASTER_ADMIN' covers legacy accounts that pre-date the
  // organization_users table or whose ou row has isPrimary = false due to a data gap.
  const [uRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId), eq(users.role, "MASTER_ADMIN")))
    .limit(1);
  return !!uRow;
}

async function countPrimaryAdmins(companyId: string): Promise<number> {
  // Must match isPrimaryAdmin(): primary if ou.is_primary OR users.role = MASTER_ADMIN
  // (legacy rows often have MASTER_ADMIN on users while ou.is_primary is false for the prior owner).
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT u.id) AS cnt
       FROM users u
      WHERE u.company_id = $1
        AND u.is_active = true
        AND (
              u.role = 'MASTER_ADMIN'
           OR EXISTS (
                SELECT 1 FROM organization_users ou
                 WHERE ou.user_id = u.id
                   AND ou.company_id = $1
                   AND ou.is_primary = true
                   AND ou.is_active = true
              )
            )`,
    [companyId]
  );
  return parseInt(rows[0]?.cnt ?? "0", 10);
}

type PersonRef = { id: string; email: string | null; name: string | null };

function displayName(p: PersonRef): string {
  return p.name || p.email || "A team member";
}

async function listPrimaryAdmins(companyId: string): Promise<PersonRef[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
      WHERE u.company_id = $1
        AND u.is_active = true
        AND (
              u.role = 'MASTER_ADMIN'
           OR EXISTS (
                SELECT 1 FROM organization_users ou
                 WHERE ou.user_id = u.id
                   AND ou.company_id = $1
                   AND ou.is_primary = true
                   AND ou.is_active = true
              )
            )`,
    [companyId],
  );
  return rows as PersonRef[];
}

/**
 * Ownership of an organization's books changed hands. Leave an audit trail and tell every
 * Primary Admin involved, so a hostile or mistaken change is noticed within minutes.
 */
async function announcePrimaryAdminChange(
  req: any,
  kind: "granted" | "transferred",
  target: PersonRef,
): Promise<void> {
  const actor = req.user as { id: string; email: string | null; name: string | null; companyId: string };
  const companyId = actor.companyId;

  logAudit({
    req,
    companyId,
    userId: actor.id,
    userEmail: actor.email,
    userName: actor.name,
    action: "UPDATE",
    entityType: "USER",
    entityId: target.id,
    description:
      kind === "transferred"
        ? `Primary Admin ownership transferred from ${displayName(actor)} to ${displayName(target)}`
        : `${displayName(target)} was made a Primary Admin by ${displayName(actor)}`,
    oldValue: kind === "transferred" ? { primaryAdmin: actor.email } : null,
    newValue: { primaryAdmin: target.email, kind },
  });

  try {
    const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const org = co?.name ?? "your organization";
    const others = (await listPrimaryAdmins(companyId)).filter((p) => p.id !== actor.id && p.id !== target.id);

    const notices: { to: string | null; subject: string; headline: string; detail: string }[] = [
      {
        to: target.email,
        subject: `You are now a Primary Admin of ${org}`,
        headline: "You are now a Primary Admin",
        detail:
          kind === "transferred"
            ? `${displayName(actor)} transferred Primary Admin ownership of ${org} to you.`
            : `${displayName(actor)} made you a Primary Admin of ${org}.`,
      },
      ...(kind === "transferred"
        ? [{
            to: actor.email,
            subject: `Primary Admin ownership of ${org} was transferred`,
            headline: "Ownership transferred",
            detail: `You transferred Primary Admin ownership of ${org} to ${displayName(target)}. Your role is now Admin.`,
          }]
        : []),
      ...others.map((p) => ({
        to: p.email,
        subject: `Primary Admin change for ${org}`,
        headline: "Primary Admin change",
        detail:
          kind === "transferred"
            ? `${displayName(actor)} transferred Primary Admin ownership of ${org} to ${displayName(target)}.`
            : `${displayName(actor)} added ${displayName(target)} as a Primary Admin of ${org}.`,
      })),
    ];

    for (const n of notices) {
      const to = (n.to ?? "").trim();
      if (!to.includes("@") || to.endsWith("@local.missionledger")) continue;
      sendSecurityNoticeEmail({ to, subject: n.subject, headline: n.headline, detail: n.detail }).catch((err) =>
        console.error("Primary Admin notice email failed:", err?.message ?? err),
      );
    }
  } catch (err) {
    console.error("Primary Admin notification failed:", err);
  }
}

// ── GET /users/me ─────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const { id: userId, companyId, email, role } = authUser;
    const [u] = await db.select({
      id: users.id, userId: users.userId, name: users.name, email: users.email,
      role: users.role, isActive: users.isActive,
    }).from(users).where(and(eq(users.id, userId), eq(users.companyId, companyId)));
    const [company] = await db.select({
      id: companies.id,
      companyCode: companies.companyCode,
      name: companies.name,
    }).from(companies).where(eq(companies.id, companyId)).limit(1);

    if (!u) {
      // Impersonation/legacy sessions can carry a valid company context while the
      // user row is not tied to that tenant. Return token-backed profile instead
      // of hard failing so admin views can still load.
      return void res.json({
        id: userId,
        userId: authUser.userId ?? "",
        name: authUser.name ?? null,
        email: email ?? "",
        role: role ?? "VIEWER",
        uiRole: mapLegacyRoleToUi(role),
        isPrimaryAdmin: false,
        isActive: true,
        companyId,
        companyCode: company?.companyCode ?? "",
        companyName: company?.name ?? authUser.companyName ?? "",
      });
    }

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
         u.id, u.user_id, u.name, u.email, u.role, u.is_active, u.created_at, u.updated_at,
         (COALESCE(ou.is_primary, false) OR u.role = 'MASTER_ADMIN') AS is_primary
       FROM users u
       LEFT JOIN organization_users ou
         ON ou.user_id = u.id
        AND ou.company_id = $1
       WHERE u.company_id = $1
       ORDER BY (COALESCE(ou.is_primary, false) OR u.role = 'MASTER_ADMIN') DESC, u.created_at ASC`,
      [companyId]
    );
    res.json(
      rows.map((u: any) => ({
        id: u.id,
        userId: u.user_id,
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
    const mismatch = assertExpectedCompany(req, companyId);
    if (mismatch) return void res.status(409).json({ error: mismatch });
    const { name, userId, email, password, role } = req.body ?? {};
    if (!userId || !password || !role) return void res.status(400).json({ error: "Missing required fields" });
    const pwError = passwordPolicyError(password);
    if (pwError) return void res.status(400).json({ error: pwError });
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const legacyRole = mapUiRoleToLegacy(role);
    if (legacyRole === "MASTER_ADMIN" && !requesterIsPrimary) {
      return void res.status(403).json({ error: "Only the Primary Admin can create another Primary Admin." });
    }

    const hashed = await hashPassword(password);
    const [created] = await db.insert(users).values({
      companyId,
      userId: String(userId).trim().toLowerCase(),
      name: name || null,
      email: email ? String(email).toLowerCase() : `${String(userId).trim().toLowerCase()}@local.missionledger`,
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

    if (legacyRole === "MASTER_ADMIN") {
      await announcePrimaryAdminChange(req, "granted", { id: created.id, email: created.email, name: created.name });
    }

    const emailStr = String(created.email ?? "");
    const isPlaceholderEmail = emailStr.endsWith("@local.missionledger");
    if (!isPlaceholderEmail && emailStr.includes("@")) {
      const [co] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      sendTeamMemberWelcomeEmail({
        to: emailStr,
        organizationName: co?.name ?? "Your organization",
        userId: created.userId,
        loginUrl: getPublicFrontendBase(req),
      }).catch((err) => console.error("Team welcome email failed:", err));
    }

    res.status(201).json({
      id: created.id,
      userId: created.userId,
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

// POST /users/:id/send-welcome-email — resend team welcome (same template as on user create)
router.post("/:id/send-welcome-email", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const mismatch = assertExpectedCompany(req, companyId);
    if (mismatch) return void res.status(409).json({ error: mismatch });
    if (!isEmailConfigured()) {
      return void res.status(503).json({
        error: "Email delivery is not configured on the server (missing RESEND_API_KEY).",
      });
    }

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, req.params.id), eq(users.companyId, companyId)))
      .limit(1);
    if (!target) return void res.status(404).json({ error: "User not found" });

    const emailStr = String(target.email ?? "");
    const isPlaceholderEmail = emailStr.endsWith("@local.missionledger");
    if (isPlaceholderEmail || !emailStr.includes("@")) {
      return void res.status(400).json({
        error: "This user has no deliverable email. Add a real email address on the account first.",
      });
    }

    const [co] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    await sendTeamMemberWelcomeEmail({
      to: emailStr,
      organizationName: co?.name ?? "Your organization",
      userId: target.userId,
      loginUrl: getPublicFrontendBase(req),
    });

    res.json({ success: true, message: "Welcome email sent." });
  } catch (error: unknown) {
    console.error("Send welcome email error:", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({
      error: "Email delivery failed. Check Resend logs and that EMAIL_FROM uses a verified domain.",
      detail,
    });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, id: currentUserId } = (req as any).user;
    const mismatch = assertExpectedCompany(req, companyId);
    if (mismatch) return void res.status(409).json({ error: mismatch });
    const { name, userId, email, password, role, isActive } = req.body ?? {};
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const targetIsPrimary = await isPrimaryAdmin(req.params.id, companyId);
    const legacyRole = role ? mapUiRoleToLegacy(role) : undefined;

    if (targetIsPrimary && !requesterIsPrimary) {
      return void res.status(403).json({ error: "Only the Primary Admin can modify another Primary Admin." });
    }
    if (targetIsPrimary && legacyRole && legacyRole !== "MASTER_ADMIN") {
      return void res.status(400).json({ error: "Use 'Make Primary Admin' transfer to change Primary Admin ownership." });
    }
    // Granting Primary Admin is owner-only (POST enforces the same rule). Without this, any
    // Admin or Pastor could PUT their own role to PRIMARY_ADMIN, then remove the real owner.
    if (legacyRole === "MASTER_ADMIN" && !requesterIsPrimary) {
      return void res.status(403).json({ error: "Only a Primary Admin can grant Primary Admin." });
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name || null;
    if (userId !== undefined) updateData.userId = String(userId).trim().toLowerCase();
    if (legacyRole) updateData.role = legacyRole;
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (email) updateData.email = email.toLowerCase();
    if (password) {
      const pwError = passwordPolicyError(password);
      if (pwError) return void res.status(400).json({ error: pwError });
      updateData.password = await hashPassword(password);
      updateData.passwordChangedAt = new Date();
    }

    const [before] = await db.select({ role: users.role }).from(users)
      .where(and(eq(users.id, req.params.id), eq(users.companyId, companyId))).limit(1);

    const [updated] = await db.update(users).set(updateData)
      .where(and(eq(users.id, req.params.id), eq(users.companyId, companyId))).returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    if (legacyRole) {
      await db.update(organizationUsers)
        .set({ role: legacyRole as any, ...(legacyRole === "MASTER_ADMIN" ? { isPrimary: true } : {}) })
        .where(and(eq(organizationUsers.userId, updated.id), eq(organizationUsers.companyId, companyId)));

      if (before && before.role !== legacyRole) {
        const actor = (req as any).user;
        logAudit({
          req,
          companyId,
          userId: actor.id,
          userEmail: actor.email,
          userName: actor.name,
          action: "UPDATE",
          entityType: "USER",
          entityId: updated.id,
          description: `Role changed for ${updated.email}: ${before.role} → ${legacyRole}`,
          oldValue: { role: before.role },
          newValue: { role: legacyRole },
        });
      }
      if (legacyRole === "MASTER_ADMIN" && !targetIsPrimary) {
        await announcePrimaryAdminChange(req, "granted", { id: updated.id, email: updated.email, name: updated.name });
      }
    }

    res.json({
      id: updated.id,
      userId: updated.userId,
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
    const mismatch = assertExpectedCompany(req, companyId);
    if (mismatch) return void res.status(409).json({ error: mismatch });
    if (req.params.id === currentUserId) return void res.status(400).json({ error: "Cannot delete yourself" });
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    const targetIsPrimary = await isPrimaryAdmin(req.params.id, companyId);
    if (targetIsPrimary && !requesterIsPrimary) {
      return void res.status(403).json({ error: "Only a Primary Admin can delete a Primary Admin." });
    }
    if (targetIsPrimary) {
      const count = await countPrimaryAdmins(companyId);
      if (count <= 1) {
        return void res.status(400).json({ error: "This is the only Primary Admin. Assign a new Primary Admin first." });
      }
    }
    await db.delete(organizationUsers).where(and(eq(organizationUsers.userId, req.params.id), eq(organizationUsers.companyId, companyId)));
    await db.delete(users).where(and(eq(users.id, req.params.id), eq(users.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Ownership transfer: the caller steps down to Admin and the target becomes Primary Admin.
// (Adding an additional co-owner without stepping down is done by setting a user's role to
// Primary Admin.) Requires the caller's password so a hijacked session can't give the
// organization away.
router.post("/:id/make-primary", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, id: currentUserId } = (req as any).user;
    const mismatch = assertExpectedCompany(req, companyId);
    if (mismatch) return void res.status(409).json({ error: mismatch });
    const requesterIsPrimary = await isPrimaryAdmin(currentUserId, companyId);
    if (!requesterIsPrimary) {
      return void res.status(403).json({ error: "Only a Primary Admin can transfer Primary Admin ownership." });
    }
    const targetUserId = req.params.id;
    if (targetUserId === currentUserId) {
      return void res.status(400).json({ error: "You are already a Primary Admin." });
    }

    const { currentPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword) {
      return void res.status(400).json({ error: "Enter your password to confirm the ownership transfer." });
    }
    const [me] = await db.select({ password: users.password }).from(users).where(eq(users.id, currentUserId)).limit(1);
    if (!me || !(await comparePassword(currentPassword, me.password))) {
      return void res.status(403).json({ error: "Your password is incorrect." });
    }

    const [target] = await db.select().from(users).where(and(eq(users.id, targetUserId), eq(users.companyId, companyId))).limit(1);
    if (!target) return void res.status(404).json({ error: "User not found" });
    if (!target.isActive) return void res.status(400).json({ error: "That user is deactivated. Reactivate them first." });
    if (await isPrimaryAdmin(targetUserId, companyId)) {
      return void res.status(400).json({ error: "That user is already a Primary Admin." });
    }

    await db.transaction(async (tx) => {
      await tx.insert(organizationUsers)
        .values({ userId: targetUserId, companyId, role: "MASTER_ADMIN" as any, isPrimary: true, isActive: true })
        .onConflictDoUpdate({
          target: [organizationUsers.userId, organizationUsers.companyId],
          set: { role: "MASTER_ADMIN" as any, isPrimary: true, isActive: true },
        });
      await tx.update(users).set({ role: "MASTER_ADMIN" as any }).where(eq(users.id, targetUserId));

      // Only the caller steps down; any other co-owners keep their ownership.
      await tx.update(organizationUsers).set({ isPrimary: false, role: "ADMIN" as any })
        .where(and(eq(organizationUsers.userId, currentUserId), eq(organizationUsers.companyId, companyId)));
      await tx.update(users).set({ role: "ADMIN" as any }).where(eq(users.id, currentUserId));
    });

    await announcePrimaryAdminChange(req, "transferred", { id: target.id, email: target.email, name: target.name });

    res.json({ success: true, newPrimaryAdminUserId: targetUserId });
  } catch (error) {
    console.error("make-primary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
