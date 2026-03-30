import { Router } from "express";
import { db, users, companies, organizationUsers } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { sendWelcomeEmail } from "../lib/email";
import {
  requireAuth,
  hashPassword,
  comparePassword,
  signToken,
  AuthUser,
  getOrCreateDefaultAccounts,
  COOKIE_NAME_EXPORT as COOKIE_NAME,
} from "../lib/auth";

const router = Router();

function generateCompanyCode(orgName?: string): string {
  // Derive first 4 letters from org name (letters only), then 2 random digits
  const letters = orgName
    ? orgName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4).padEnd(4, "X")
    : "ORG" + "X";
  const digits = String(Math.floor(Math.random() * 90) + 10); // 10–99
  return letters + digits;
}

function setCookieAndRespond(res: any, authUser: AuthUser, status = 200) {
  const token = signToken(authUser);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.status(status).json({ ...authUser, token });
}

// GET /auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json((req as any).user);
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { companyCode, email, password } = req.body ?? {};
    if (!companyCode || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [company] = await db.select().from(companies)
      .where(eq(companies.companyCode, companyCode.toUpperCase()))
      .limit(1);

    if (!company) {
      return res.status(401).json({ error: "Invalid company code" });
    }
    if (!company.isActive) {
      return res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "This organization account has been suspended." });
    }

    const [user] = await db.select().from(users).where(
      and(eq(users.email, email.toLowerCase()), eq(users.isActive, true))
    ).limit(1);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify user has access to this company (check org_users or legacy companyId)
    const [orgMembership] = await db.select().from(organizationUsers)
      .where(and(eq(organizationUsers.userId, user.id), eq(organizationUsers.companyId, company.id), eq(organizationUsers.isActive, true)))
      .limit(1);

    // Fall back to legacy companyId check
    if (!orgMembership && user.companyId !== company.id) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const effectiveRole = orgMembership?.role ?? user.role;

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      companyId: company.id,
      companyName: company.name,
      companyCode: company.companyCode,
      organizationType: company.organizationType,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    logAudit({
      req,
      companyId: company.id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: "LOGIN",
      entityType: "SESSION",
      entityId: user.id,
      description: `User logged in: ${user.email} (${company.companyCode})`,
    });

    setCookieAndRespond(res, authUser);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { organizationName, ein, organizationType, adminName, adminEmail, password } = req.body ?? {};
    if (!organizationName || !ein || !organizationType || !adminEmail || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await db.select().from(users).where(eq(users.email, adminEmail.toLowerCase())).limit(1);
    if (existingUser.length) {
      return res.status(400).json({ error: "Email already registered" });
    }

    let companyCode = generateCompanyCode(organizationName);
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(companies).where(eq(companies.companyCode, companyCode)).limit(1);
      if (!existing.length) break;
      companyCode = generateCompanyCode(organizationName);
      attempts++;
    }

    const hashedPw = await hashPassword(password);

    const [company] = await db.insert(companies).values({
      companyCode,
      name: organizationName,
      ein: ein.replace(/\D/g, "").replace(/(\d{2})(\d{7})/, "$1-$2"),
      organizationType: organizationType as any,
      isActive: true,
      subscriptionStatus: "TRIAL",
    }).returning();

    const [user] = await db.insert(users).values({
      companyId: company.id,
      name: adminName || null,
      email: adminEmail.toLowerCase(),
      password: hashedPw,
      role: "ADMIN",
      isActive: true,
      isPlatformAdmin: false,
    }).returning();

    // Create organization_users entry (primary membership)
    await db.insert(organizationUsers).values({
      userId: user.id,
      companyId: company.id,
      role: "ADMIN",
      isPrimary: true,
      isActive: true,
    });

    await getOrCreateDefaultAccounts(company.id);

    const { seedChartOfAccounts } = await import("./chart-of-accounts");
    await seedChartOfAccounts(company.id);

    const { funds } = await import("@workspace/db");
    await db.insert(funds).values({
      companyId: company.id,
      name: "General Fund",
      description: "Default general operating fund",
      isActive: true,
    });

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: company.id,
      companyName: company.name,
      companyCode: company.companyCode,
      organizationType: company.organizationType,
      isPlatformAdmin: false,
    };

    sendWelcomeEmail(user.email, company.name).catch((err) =>
      console.error("Welcome email failed:", err.message)
    );

    setCookieAndRespond(res, authUser, 201);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/my-orgs — list all organizations the current user belongs to
router.get("/my-orgs", requireAuth, async (req, res) => {
  try {
    const { id: userId } = (req as any).user as AuthUser;

    const memberships = await db.select({
      companyId: organizationUsers.companyId,
      role: organizationUsers.role,
      isPrimary: organizationUsers.isPrimary,
      joinedAt: organizationUsers.joinedAt,
    }).from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.isActive, true)));

    if (!memberships.length) {
      // Fallback: user has no org_users rows, use their companyId
      const user = (req as any).user as AuthUser;
      const [company] = await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1);
      return res.json([{
        companyId: company.id,
        companyName: company.name,
        companyCode: company.companyCode,
        organizationType: company.organizationType,
        role: user.role,
        isPrimary: true,
        isActive: company.isActive,
      }]);
    }

    const companyIds = memberships.map(m => m.companyId);
    const orgs = await db.select({
      id: companies.id,
      name: companies.name,
      companyCode: companies.companyCode,
      organizationType: companies.organizationType,
      isActive: companies.isActive,
      subscriptionStatus: companies.subscriptionStatus,
    }).from(companies).where(inArray(companies.id, companyIds));

    const result = memberships
      .map(m => {
        const org = orgs.find(o => o.id === m.companyId);
        if (!org) return null;
        return {
          companyId: org.id,
          companyName: org.name,
          companyCode: org.companyCode,
          organizationType: org.organizationType,
          role: m.role,
          isPrimary: m.isPrimary,
          isActive: org.isActive,
        };
      })
      .filter(Boolean);

    res.json(result);
  } catch (error) {
    console.error("My orgs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/switch-org — switch the active organization context
router.post("/switch-org", requireAuth, async (req, res) => {
  try {
    const { id: userId, isPlatformAdmin } = (req as any).user as AuthUser;
    const { companyId } = req.body ?? {};

    if (!companyId) {
      return res.status(400).json({ error: "companyId is required" });
    }

    // Verify access: check organization_users or platform admin
    if (!isPlatformAdmin) {
      const [membership] = await db.select().from(organizationUsers)
        .where(and(
          eq(organizationUsers.userId, userId),
          eq(organizationUsers.companyId, companyId),
          eq(organizationUsers.isActive, true)
        ))
        .limit(1);

      // Also allow if it's the user's primary company (legacy support)
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!membership && user?.companyId !== companyId) {
        return res.status(403).json({ error: "You do not have access to this organization" });
      }
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company || !company.isActive) {
      return res.status(403).json({ error: "Organization is not accessible" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [membership] = await db.select().from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.companyId, companyId)))
      .limit(1);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: membership?.role ?? user.role,
      companyId: company.id,
      companyName: company.name,
      companyCode: company.companyCode,
      organizationType: company.organizationType,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    setCookieAndRespond(res, authUser);
  } catch (error) {
    console.error("Switch org error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/admin-login — dedicated platform admin login (email + password only, no company code)
// Hard security: only accepts users with isPlatformAdmin = true
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.isPlatformAdmin, true)))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        error: "ACCESS_DENIED",
        message: "Platform Administrator credentials not recognized.",
      });
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({
        error: "ACCESS_DENIED",
        message: "Platform Administrator credentials not recognized.",
      });
    }

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
      isPlatformAdmin: true,
    };

    setCookieAndRespond(res, authUser);
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
