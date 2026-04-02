import { Request, Response, NextFunction } from "express";
import { db, pool } from "@workspace/db";
import { users, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "missionledger-secret-key-2024";
const COOKIE_NAME = "ml_session";

export interface AuthUser {
  id: string;
  userId?: string;
  email: string;
  name: string | null;
  role: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  organizationType: string;
  isPlatformAdmin: boolean;
  impersonatedBy?: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerAuth = req.headers.authorization;
  const headerToken = headerAuth
    ? headerAuth.startsWith("Bearer ")
      ? headerAuth.slice("Bearer ".length).trim()
      : headerAuth.trim()
    : undefined;
  // Prefer Bearer so the SPA's ml_token (updated on each login) wins over a stale
  // ml_session cookie—common when the API is on another site and Set-Cookie is unreliable.
  const token = headerToken || cookieToken;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Enforce company-level guards on every request
  if (user.companyId && !user.isPlatformAdmin) {
    const { rows } = await pool.query(
      `SELECT is_active, subscription_status, created_at, is_comped FROM companies WHERE id = $1 LIMIT 1`,
      [user.companyId]
    );
    const company = rows[0];

    if (company) {
      // 1. Account suspension
      if (!company.is_active) {
        res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your organization account has been suspended. Please contact support." });
        return;
      }

      // 2. Comped accounts bypass subscription gating entirely
      if (company.is_comped) {
        (req as any).user = user;
        next();
        return;
      }

      // 3. Subscription gate — exempt billing/auth/health routes so users can pay
      const url = (req as any).originalUrl ?? "";
      const isExempt =
        url.includes("/api/stripe") ||
        url.includes("/api/auth") ||
        url.includes("/api/healthz");

      if (!isExempt) {
        const subscriptionStatus = company.subscription_status;
        const createdAt = company.created_at;
        if (subscriptionStatus === "ACTIVE") {
          // valid — fall through
        } else if (subscriptionStatus === "TRIAL") {
          const trialExpiry = new Date(createdAt);
          trialExpiry.setDate(trialExpiry.getDate() + 14);
          if (new Date() > trialExpiry) {
            res.status(402).json({
              error: "SUBSCRIPTION_REQUIRED",
              message: "Your free trial has expired. Please subscribe to continue using MissionLedger.",
            });
            return;
          }
        } else {
          // INACTIVE or CANCELLED
          res.status(402).json({
            error: "SUBSCRIPTION_REQUIRED",
            message: "An active subscription is required to access this feature.",
          });
          return;
        }
      }
    }
  }

  // Board users are read-only at API level, except report/custom-report creation flows.
  const method = (req.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && user?.role === "OFFICER") {
    const url = (req as any).originalUrl ?? "";
    const boardWriteAllowlist = [
      "/api/custom-reports/run",
      "/api/custom-reports/templates",
      "/api/auth/logout",
      "/api/auth/switch-org",
    ];
    if (!boardWriteAllowlist.some((p) => url.startsWith(p))) {
      res.status(403).json({ error: "READ_ONLY_ROLE", message: "Board role is read-only." });
      return;
    }
    if (url.startsWith("/api/custom-reports/templates") && method !== "POST") {
      res.status(403).json({ error: "READ_ONLY_ROLE", message: "Board role is read-only." });
      return;
    }
  }

  (req as any).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthUser;
  if (user?.role !== "ADMIN" && user?.role !== "MASTER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthUser;
  if (!user?.isPlatformAdmin) {
    res.status(403).json({ error: "PLATFORM_ADMIN_REQUIRED", message: "This endpoint requires platform administrator access." });
    return;
  }
  next();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;

export async function getOrCreateDefaultAccounts(companyId: string): Promise<void> {
  const { accounts } = await import("@workspace/db");
  const existingAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  if (existingAccounts.length > 0) return;

  const defaultAccounts = [
    { code: "1000", name: "Cash and Bank Accounts", type: "ASSET" as const },
    { code: "1010", name: "Checking Account", type: "ASSET" as const, parentCode: "1000" },
    { code: "1020", name: "Savings Account", type: "ASSET" as const, parentCode: "1000" },
    { code: "1100", name: "Accounts Receivable", type: "ASSET" as const },
    { code: "1200", name: "Pledges Receivable", type: "ASSET" as const },
    { code: "1500", name: "Fixed Assets", type: "ASSET" as const },
    { code: "2000", name: "Accounts Payable", type: "LIABILITY" as const },
    { code: "2100", name: "Accrued Expenses", type: "LIABILITY" as const },
    { code: "3000", name: "Net Assets", type: "EQUITY" as const },
    { code: "3100", name: "Unrestricted Net Assets", type: "EQUITY" as const },
    { code: "3200", name: "Restricted Net Assets", type: "EQUITY" as const },
    { code: "4000", name: "Revenue", type: "REVENUE" as const },
    { code: "4100", name: "Donations", type: "REVENUE" as const, parentCode: "4000" },
    { code: "4200", name: "Grants", type: "REVENUE" as const, parentCode: "4000" },
    { code: "4300", name: "Program Revenue", type: "REVENUE" as const, parentCode: "4000" },
    { code: "4400", name: "Membership Dues", type: "REVENUE" as const, parentCode: "4000" },
    { code: "5000", name: "Expenses", type: "EXPENSE" as const },
    { code: "5100", name: "Salaries and Wages", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5200", name: "Rent and Occupancy", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5300", name: "Office Supplies", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5400", name: "Utilities", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5500", name: "Program Expenses", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5600", name: "Marketing and Communications", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5700", name: "Professional Services", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5800", name: "Travel and Transportation", type: "EXPENSE" as const, parentCode: "5000" },
    { code: "5900", name: "Miscellaneous Expenses", type: "EXPENSE" as const, parentCode: "5000" },
  ];

  const createdMap: Record<string, string> = {};
  for (const acct of defaultAccounts) {
    const parentId = acct.parentCode ? createdMap[acct.parentCode] : null;
    const [created] = await db.insert(accounts).values({
      companyId,
      code: acct.code,
      name: acct.name,
      type: acct.type,
      isActive: true,
      parentId: parentId || null,
    }).returning();
    createdMap[acct.code] = created.id;
  }
}
