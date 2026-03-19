import { Router } from "express";
import { db, users, companies, bankAccounts } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import {
  requireAuth,
  requirePlatformAdmin,
  signToken,
  AuthUser,
  COOKIE_NAME_EXPORT as COOKIE_NAME,
} from "../lib/auth";

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

// ── GET /master-admin/stats ────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [totalOrgs] = await db.select({ count: count() }).from(companies);
    const [activeOrgs] = await db.select({ count: count() }).from(companies).where(eq(companies.isActive, true));
    const [suspendedOrgs] = await db.select({ count: count() }).from(companies).where(eq(companies.isActive, false));
    const [totalUsers] = await db.select({ count: count() }).from(users);
    const [paidSubs] = await db.select({ count: count() }).from(companies).where(eq(companies.subscriptionStatus, "ACTIVE"));
    const [trialOrgs] = await db.select({ count: count() }).from(companies).where(eq(companies.subscriptionStatus, "TRIAL"));

    // Global Alerts: ACTIVE orgs with a Plaid-linked bank account but no reconciliation completed in 30+ days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { rows: alertRows } = await pool.query(`
      SELECT COUNT(DISTINCT c.id) AS cnt
      FROM companies c
      INNER JOIN bank_accounts ba ON ba.company_id = c.id AND ba.is_plaid_linked = true AND ba.is_active = true
      WHERE c.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM reconciliations r
          WHERE r.company_id = c.id
            AND r.status = 'COMPLETED'
            AND r.reconciled_at > $1
        )
    `, [thirtyDaysAgo]);
    const globalAlerts = parseInt(alertRows[0]?.cnt ?? "0");

    // Global maintenance mode
    const { rows: maintRows } = await pool.query(`SELECT value FROM system_settings WHERE key = 'global_maintenance_mode'`);
    const globalMaintenanceMode = maintRows[0]?.value === "true";

    res.json({
      totalOrgs: totalOrgs.count,
      activeOrgs: activeOrgs.count,
      suspendedOrgs: suspendedOrgs.count,
      totalUsers: totalUsers.count,
      paidSubscriptions: paidSubs.count,
      trialOrgs: trialOrgs.count,
      globalAlerts,
      globalMaintenanceMode,
    });
  } catch (error) {
    console.error("Master admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /master-admin/organizations ───────────────────────────────────────────
router.get("/organizations", async (_req, res) => {
  try {
    const orgs = await db.select({
      id: companies.id,
      name: companies.name,
      companyCode: companies.companyCode,
      organizationType: companies.organizationType,
      isActive: companies.isActive,
      subscriptionStatus: companies.subscriptionStatus,
      stripeCustomerId: companies.stripeCustomerId,
      ein: companies.ein,
      email: companies.email,
      phone: companies.phone,
      createdAt: companies.createdAt,
      closedUntil: companies.closedUntil,
    }).from(companies).orderBy(companies.createdAt);

    // Get maintenance_mode per org via raw SQL (column added via ensureSchema)
    const { rows: maintModes } = await pool.query(`SELECT id, maintenance_mode FROM companies`);
    const maintMap: Record<string, boolean> = {};
    for (const r of maintModes) { maintMap[r.id] = r.maintenance_mode ?? false; }

    // User counts per org
    const userCounts = await db.select({ companyId: users.companyId, count: count() }).from(users).groupBy(users.companyId);
    const userCountMap: Record<string, number> = {};
    for (const row of userCounts) { userCountMap[row.companyId] = row.count; }

    // Plaid health per org: any active plaid-linked bank account?
    const plaidOrgs = await db.select({ companyId: bankAccounts.companyId, count: count() })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.isPlaidLinked, true), eq(bankAccounts.isActive, true)))
      .groupBy(bankAccounts.companyId);
    const plaidMap: Record<string, boolean> = {};
    for (const r of plaidOrgs) { plaidMap[r.companyId] = r.count > 0; }

    // Last reconciliation per org
    const { rows: lastRecon } = await pool.query(`
      SELECT company_id, MAX(reconciled_at) AS last_reconciled
      FROM reconciliations
      WHERE status = 'COMPLETED'
      GROUP BY company_id
    `);
    const reconMap: Record<string, Date | null> = {};
    for (const r of lastRecon) { reconMap[r.company_id] = r.last_reconciled ? new Date(r.last_reconciled) : null; }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = orgs.map(org => {
      const maintenanceMode = maintMap[org.id] ?? false;
      const plaidActive = plaidMap[org.id] ?? false;
      const stripeActive = org.subscriptionStatus === "ACTIVE";
      const lastReconDate = reconMap[org.id] ?? null;
      const unreconciledAlert = plaidActive && (!lastReconDate || lastReconDate < thirtyDaysAgo);

      let status: "ACTIVE" | "MAINTENANCE" | "SUSPENDED";
      if (!org.isActive) status = "SUSPENDED";
      else if (maintenanceMode) status = "MAINTENANCE";
      else status = "ACTIVE";

      return {
        ...org,
        maintenanceMode,
        status,
        userCount: userCountMap[org.id] ?? 0,
        dbHealth: { plaidActive, stripeActive },
        unreconciledAlert,
        lastReconciledAt: lastReconDate?.toISOString() ?? null,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Master admin orgs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /master-admin/organizations/:id ───────────────────────────────────────
router.get("/organizations/:id", async (req, res) => {
  try {
    const [org] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const orgUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.companyId, org.id));

    const bankAccs = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, org.id));

    res.json({ ...org, users: orgUsers, bankAccounts: bankAccs });
  } catch (error) {
    console.error("Master admin org detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /master-admin/organizations/:id ─────────────────────────────────────
router.patch("/organizations/:id", async (req, res) => {
  try {
    const { isActive, maintenanceMode, suspendedReason } = req.body ?? {};
    const [org] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    // Use raw SQL to handle the maintenance_mode column (added via ensureSchema)
    const updates: string[] = ["updated_at = NOW()"];
    const values: any[] = [req.params.id];

    if (typeof isActive === "boolean") {
      updates.push(`is_active = $${values.length + 1}`);
      values.push(isActive);
    }
    if (typeof maintenanceMode === "boolean") {
      updates.push(`maintenance_mode = $${values.length + 1}`);
      values.push(maintenanceMode);
    }

    if (updates.length === 1) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const { rows } = await pool.query(
      `UPDATE companies SET ${updates.join(", ")} WHERE id = $1 RETURNING id, name, is_active, maintenance_mode`,
      values
    );

    res.json({ success: true, organization: rows[0], suspendedReason });
  } catch (error) {
    console.error("Master admin org update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /master-admin/system ───────────────────────────────────────────────────
router.get("/system", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT key, value FROM system_settings`);
    const settings: Record<string, string> = {};
    for (const r of rows) { settings[r.key] = r.value; }
    res.json({
      globalMaintenanceMode: settings["global_maintenance_mode"] === "true",
      settings,
    });
  } catch (error) {
    console.error("System settings error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /master-admin/system/maintenance ─────────────────────────────────────
router.post("/system/maintenance", async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required." });
    }
    await pool.query(
      `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = 'global_maintenance_mode'`,
      [String(enabled)]
    );
    res.json({ success: true, globalMaintenanceMode: enabled });
  } catch (error) {
    console.error("Maintenance mode toggle error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /master-admin/global-coa ──────────────────────────────────────────────
router.get("/global-coa", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT code, name, type, parent_code, sort_order FROM coa_templates ORDER BY sort_order ASC`);
    res.json(rows);
  } catch (error) {
    console.error("Global COA error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /master-admin/global-coa ─────────────────────────────────────────────
router.post("/global-coa", async (req, res) => {
  try {
    const { code, name, type, parentCode } = req.body ?? {};
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, and type are required." });
    const validTypes = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
    if (!validTypes.includes(type)) return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });

    const { rows } = await pool.query(`
      INSERT INTO coa_templates (code, name, type, parent_code, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, parent_code = EXCLUDED.parent_code, sort_order = EXCLUDED.sort_order
      RETURNING *
    `, [code.trim(), name.trim(), type, parentCode || null, parseInt(code) || 0]);

    res.json({ success: true, entry: rows[0] });
  } catch (error) {
    console.error("Global COA upsert error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /master-admin/global-coa/:code ─────────────────────────────────────
router.delete("/global-coa/:code", async (req, res) => {
  try {
    await pool.query(`DELETE FROM coa_templates WHERE code = $1`, [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    console.error("Global COA delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /master-admin/impersonate/:companyId ──────────────────────────────────
router.post("/impersonate/:companyId", async (req, res) => {
  try {
    const adminUser = (req as any).user as AuthUser;
    const { companyId } = req.params;

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: "Organization not found" });

    const impersonatedUser: AuthUser = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: "MASTER_ADMIN",
      companyId: company.id,
      companyName: company.name,
      companyCode: company.companyCode,
      organizationType: company.organizationType,
      isPlatformAdmin: true,
      impersonatedBy: adminUser.id,
    };

    const token = signToken(impersonatedUser);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.json({ success: true, session: impersonatedUser });
  } catch (error) {
    console.error("Impersonate error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /master-admin/exit-impersonation ──────────────────────────────────────
router.post("/exit-impersonation", async (req, res) => {
  try {
    const currentUser = (req as any).user as AuthUser;

    const [user] = await db.select().from(users).where(eq(users.id, currentUser.id)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [company] = user.companyId
      ? await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1)
      : [null];

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: company?.id ?? "",
      companyName: company?.name ?? "Platform Admin",
      companyCode: company?.companyCode ?? "ADMIN",
      organizationType: company?.organizationType ?? "NONPROFIT",
      isPlatformAdmin: user.isPlatformAdmin,
    };

    const token = signToken(authUser);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, session: authUser });
  } catch (error) {
    console.error("Exit impersonation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
