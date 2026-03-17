import { Router } from "express";
import { db, users, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

function generateCompanyCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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

    const company = await db.select().from(companies).where(eq(companies.companyCode, companyCode.toUpperCase())).limit(1);
    if (!company.length || !company[0].isActive) {
      return res.status(401).json({ error: "Invalid company code" });
    }

    const user = await db.select().from(users).where(
      and(eq(users.companyId, company[0].id), eq(users.email, email.toLowerCase()))
    ).limit(1);

    if (!user.length || !user[0].isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await comparePassword(password, user[0].password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const authUser: AuthUser = {
      id: user[0].id,
      email: user[0].email,
      name: user[0].name,
      role: user[0].role,
      companyId: company[0].id,
      companyName: company[0].name,
      companyCode: company[0].companyCode,
      organizationType: company[0].organizationType,
    };

    const token = signToken(authUser);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json(authUser);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", (_req, res) => {
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

    // Check if email already used
    const existingUser = await db.select().from(users).where(eq(users.email, adminEmail.toLowerCase())).limit(1);
    if (existingUser.length) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Generate unique company code
    let companyCode = generateCompanyCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(companies).where(eq(companies.companyCode, companyCode)).limit(1);
      if (!existing.length) break;
      companyCode = generateCompanyCode();
      attempts++;
    }

    const hashedPw = await hashPassword(password);

    // Create company
    const [company] = await db.insert(companies).values({
      companyCode,
      name: organizationName,
      ein: ein.replace(/\D/g, "").replace(/(\d{2})(\d{7})/, "$1-$2"),
      organizationType: organizationType as any,
      isActive: true,
      subscriptionStatus: "TRIAL",
    }).returning();

    // Create admin user
    const [user] = await db.insert(users).values({
      companyId: company.id,
      name: adminName || null,
      email: adminEmail.toLowerCase(),
      password: hashedPw,
      role: "ADMIN",
      isActive: true,
    }).returning();

    // Create default chart of accounts
    await getOrCreateDefaultAccounts(company.id);

    // Create default General Fund
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
    };

    const token = signToken(authUser);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json(authUser);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
