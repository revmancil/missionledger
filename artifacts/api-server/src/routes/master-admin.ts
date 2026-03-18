import { Router } from "express";
import { db, users, companies, organizationUsers } from "@workspace/db";
import { eq, count, sql, ne } from "drizzle-orm";
import {
  requireAuth,
  requirePlatformAdmin,
  signToken,
  AuthUser,
  COOKIE_NAME_EXPORT as COOKIE_NAME,
} from "../lib/auth";

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

// GET /master-admin/stats
router.get("/stats", async (_req, res) => {
  try {
    const [totalOrgs] = await db.select({ count: count() }).from(companies);
    const [activeOrgs] = await db.select({ count: count() }).from(companies).where(eq(companies.isActive, true));
    const [suspendedOrgs] = await db.select({ count: count() }).from(companies).where(eq(companies.isActive, false));
    const [totalUsers] = await db.select({ count: count() }).from(users);

    res.json({
      totalOrgs: totalOrgs.count,
      activeOrgs: activeOrgs.count,
      suspendedOrgs: suspendedOrgs.count,
      totalUsers: totalUsers.count,
    });
  } catch (error) {
    console.error("Master admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /master-admin/organizations
router.get("/organizations", async (_req, res) => {
  try {
    const orgs = await db.select({
      id: companies.id,
      name: companies.name,
      companyCode: companies.companyCode,
      organizationType: companies.organizationType,
      isActive: companies.isActive,
      subscriptionStatus: companies.subscriptionStatus,
      ein: companies.ein,
      email: companies.email,
      phone: companies.phone,
      createdAt: companies.createdAt,
      closedUntil: companies.closedUntil,
    }).from(companies).orderBy(companies.createdAt);

    // Get user counts per org
    const userCounts = await db.select({
      companyId: users.companyId,
      count: count(),
    }).from(users).groupBy(users.companyId);

    const userCountMap: Record<string, number> = {};
    for (const row of userCounts) {
      userCountMap[row.companyId] = row.count;
    }

    const result = orgs.map(org => ({
      ...org,
      userCount: userCountMap[org.id] ?? 0,
    }));

    res.json(result);
  } catch (error) {
    console.error("Master admin orgs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /master-admin/organizations/:id
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

    res.json({ ...org, users: orgUsers });
  } catch (error) {
    console.error("Master admin org detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /master-admin/organizations/:id — suspend or activate
router.patch("/organizations/:id", async (req, res) => {
  try {
    const { isActive, suspendedReason } = req.body ?? {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive (boolean) is required" });
    }

    const [org] = await db.select().from(companies).where(eq(companies.id, req.params.id)).limit(1);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const [updated] = await db.update(companies)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, req.params.id))
      .returning();

    res.json({ success: true, organization: updated, suspendedReason });
  } catch (error) {
    console.error("Master admin org update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /master-admin/impersonate/:companyId — issue a JWT for a specific org
router.post("/impersonate/:companyId", async (req, res) => {
  try {
    const adminUser = (req as any).user as AuthUser;
    const { companyId } = req.params;

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: "Organization not found" });

    // Find the first ADMIN/MASTER_ADMIN user of this org for context
    const [orgAdmin] = await db.select().from(users)
      .where(eq(users.companyId, companyId))
      .limit(1);

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
      maxAge: 2 * 60 * 60 * 1000, // 2-hour impersonation session
    });

    res.json({ success: true, session: impersonatedUser });
  } catch (error) {
    console.error("Impersonate error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /master-admin/exit-impersonation — return to original platform admin session
router.post("/exit-impersonation", async (req, res) => {
  try {
    const currentUser = (req as any).user as AuthUser;

    // Re-look up the original platform admin
    const [user] = await db.select().from(users).where(eq(users.id, currentUser.id)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [company] = await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: company.id,
      companyName: company.name,
      companyCode: company.companyCode,
      organizationType: company.organizationType,
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
