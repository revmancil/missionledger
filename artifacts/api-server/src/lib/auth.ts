import { Request, Response, NextFunction } from "express";
import { db, pool } from "@workspace/db";
import { users, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { isSubscriptionExemptPath, pathIsOrUnder, requestPath } from "./requestPath";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but was not provided.",
  );
}
const JWT_SECRET = process.env.JWT_SECRET;
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

/** Copy of just the identity fields, safe to re-sign (a decoded token also carries iat/exp, which jwt.sign rejects). */
export function toAuthUser(u: AuthUser): AuthUser {
  return {
    id: u.id,
    userId: u.userId,
    email: u.email,
    name: u.name,
    role: u.role,
    companyId: u.companyId,
    companyName: u.companyName,
    companyCode: u.companyCode,
    organizationType: u.organizationType,
    isPlatformAdmin: u.isPlatformAdmin,
    ...(u.impersonatedBy ? { impersonatedBy: u.impersonatedBy } : {}),
  };
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

/**
 * Express 5 types `req.params` as `string | string[]` (ParamsDictionary). Declaring these
 * middlewares as generic in the params type lets TypeScript infer the concrete params from
 * each route's path (e.g. "/:id" -> { id: string }) instead of collapsing every handler in
 * the chain to the loose ParamsDictionary. Without this, `eq(table.id, req.params.id)` fails
 * Drizzle's overloads because the column is typed `string`.
 *
 * `ParamsDictionary` is not importable from "express" (it uses `export =`), so the default
 * uses a plain string map, which is all these middlewares need.
 */
type RouteParams = Record<string, string>;

export async function requireAuth<P = RouteParams>(req: Request<P>, res: Response, next: NextFunction): Promise<void> {
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

  const claims = verifyToken(token) as (AuthUser & { iat?: number }) | null;
  if (!claims) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // The signed token is only proof of *who* logged in and when. Whether that person may
  // still act — and with which role — is decided from the database on every request, so
  // deleting, deactivating, demoting or removing a user takes effect immediately instead of
  // lingering until the 7-day token expires.
  let row: Record<string, any> | undefined;
  try {
    const result = await pool.query(
      `SELECT u.is_active            AS u_active,
              u.is_platform_admin    AS u_platform_admin,
              u.role                 AS u_role,
              u.company_id           AS u_company_id,
              EXTRACT(EPOCH FROM u.password_changed_at)::float8 AS pw_changed_epoch,
              ou.role                AS ou_role,
              ou.is_active           AS ou_active,
              c.is_active            AS c_active,
              c.subscription_status  AS c_subscription_status,
              c.created_at           AS c_created_at,
              c.is_comped            AS c_is_comped
         FROM users u
         LEFT JOIN organization_users ou ON ou.user_id = u.id AND ou.company_id = $2
         LEFT JOIN companies c ON c.id = $2
        WHERE u.id = $1
        LIMIT 1`,
      [claims.id, claims.companyId ?? ""],
    );
    row = result.rows[0];
  } catch (e) {
    console.error("requireAuth: user/company lookup failed:", e);
    res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Could not verify your session. Try again in a moment.",
    });
    return;
  }

  if (!row || !row.u_active) {
    res.status(401).json({ error: "Unauthorized", message: "This user account is no longer active." });
    return;
  }

  // A password change or reset signs out every session issued before it.
  const pwChangedEpoch = row.pw_changed_epoch == null ? 0 : Math.floor(Number(row.pw_changed_epoch));
  if (pwChangedEpoch && (!claims.iat || claims.iat < pwChangedEpoch)) {
    res.status(401).json({ error: "SESSION_EXPIRED", message: "Your password was changed. Please sign in again." });
    return;
  }

  // Platform-admin status in the token only counts while the database still agrees.
  const isPlatformAdmin = !!claims.isPlatformAdmin && row.u_platform_admin === true;
  let role = claims.role;

  if (claims.impersonatedBy) {
    if (!isPlatformAdmin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else if (!isPlatformAdmin) {
    // Same membership rule as /auth/login: an active organization_users row for this
    // company, or the user's legacy home company.
    const orgMember = row.ou_role != null && row.ou_active === true;
    if (!orgMember && row.u_company_id !== claims.companyId) {
      res.status(403).json({ error: "NOT_A_MEMBER", message: "You no longer have access to this organization." });
      return;
    }
    role = orgMember ? row.ou_role : row.u_role;
  }

  const user: AuthUser = { ...claims, role, isPlatformAdmin };

  // Enforce company-level guards on every request
  if (user.companyId && !user.isPlatformAdmin && row.c_active !== null && row.c_active !== undefined) {
    // 1. Account suspension
    if (!row.c_active) {
      res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "Your organization account has been suspended. Please contact support." });
      return;
    }

    // 2. Subscription gate — comped accounts skip it, and billing/auth/health routes are
    //    exempt so users can pay. (Comped accounts must still fall through to the role
    //    checks below.)
    if (!row.c_is_comped && !isSubscriptionExemptPath((req as any).originalUrl)) {
      const subscriptionStatus = row.c_subscription_status;
      if (subscriptionStatus === "ACTIVE") {
        // valid — fall through
      } else if (subscriptionStatus === "TRIAL") {
        const trialExpiry = new Date(String(row.c_created_at));
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

  // Board users are read-only at API level, except report/custom-report creation flows.
  const method = (req.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && user.role === "OFFICER") {
    const path = requestPath((req as any).originalUrl);
    const boardWriteAllowlist = [
      "/api/custom-reports/run",
      "/api/custom-reports/templates",
      "/api/auth/logout",
      "/api/auth/switch-org",
    ];
    if (!boardWriteAllowlist.some((p) => pathIsOrUnder(path, p))) {
      res.status(403).json({ error: "READ_ONLY_ROLE", message: "Board role is read-only." });
      return;
    }
    if (pathIsOrUnder(path, "/api/custom-reports/templates") && method !== "POST") {
      res.status(403).json({ error: "READ_ONLY_ROLE", message: "Board role is read-only." });
      return;
    }
  }

  (req as any).user = user;
  next();
}

export function requireAdmin<P = RouteParams>(req: Request<P>, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthUser;
  // PASTOR is admin-equivalent — the church-org counterpart to ADMIN, not a lesser role.
  if (user?.role !== "ADMIN" && user?.role !== "MASTER_ADMIN" && user?.role !== "PASTOR") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export function requirePlatformAdmin<P = RouteParams>(req: Request<P>, res: Response, next: NextFunction): void {
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
