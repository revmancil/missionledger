import { Router } from "express";
import { db, users, companies, organizationUsers } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { sendWelcomeEmail, sendUserIdRecoveryEmail } from "../lib/email";
import {
  requireAuth,
  requirePlatformAdmin,
  hashPassword,
  comparePassword,
  burnPasswordCheck,
  signToken,
  AuthUser,
  toAuthUser,
  getOrCreateDefaultAccounts,
  COOKIE_NAME_EXPORT as COOKIE_NAME,
} from "../lib/auth";
import { loginAccountLimiter } from "../lib/rateLimiters";
import { passwordPolicyError } from "../lib/password";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "../lib/secretBox";
import { generateTotpSecret, verifyTotp, otpauthUri } from "../lib/totp";

const router = Router();

function generateCompanyCode(orgName?: string): string {
  // Derive first 4 letters from org name (letters only), then 2 random digits
  const letters = orgName
    ? orgName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4).padEnd(4, "X")
    : "ORG" + "X";
  const digits = String(Math.floor(Math.random() * 90) + 10); // 10–99
  return letters + digits;
}

function setSessionCookie(res: any, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function setCookieAndRespond(res: any, authUser: AuthUser, status = 200) {
  const token = signToken(authUser);
  setSessionCookie(res, token);
  res.status(status).json({ ...authUser, token });
}

/**
 * Platform admins with MFA enabled must present a valid TOTP code on every sign-in path
 * (the admin portal AND the normal company login). Returns true when the request may
 * proceed; otherwise the response has already been sent.
 */
async function passesMfa(
  res: any,
  user: { id: string; totpEnabled: boolean; totpSecret: string | null; totpLastStep: number | null },
  code: unknown,
): Promise<boolean> {
  if (!user.totpEnabled || !user.totpSecret) return true;
  if (code === undefined || code === null || code === "") {
    res.status(401).json({ error: "MFA_REQUIRED", message: "Enter the 6-digit code from your authenticator app." });
    return false;
  }
  let secret: string;
  try {
    secret = decryptSecret(user.totpSecret);
  } catch (err) {
    console.error("MFA secret unreadable:", err);
    res.status(503).json({ error: "MFA_UNAVAILABLE", message: "Multi-factor authentication is temporarily unavailable." });
    return false;
  }
  const step = verifyTotp(secret, code, { lastUsedStep: user.totpLastStep });
  if (step === null) {
    res.status(401).json({ error: "ACCESS_DENIED", message: "Invalid authentication code." });
    return false;
  }
  await db.update(users).set({ totpLastStep: step }).where(eq(users.id, user.id));
  return true;
}

// GET /auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json((req as any).user);
});

// POST /auth/find-user-id
router.post("/find-user-id", async (req, res) => {
  try {
    const { companyCode, email } = req.body ?? {};
    if (!companyCode || !email) {
      return void res.status(400).json({ error: "companyCode and email are required" });
    }

    const normalizedCompanyCode = String(companyCode).trim().toUpperCase();
    const [company] = await db.select().from(companies)
      .where(eq(companies.companyCode, normalizedCompanyCode))
      .limit(1);
    if (!company) return void res.json({ ok: true, userIds: [] });

    const rows = await db.select({ userId: users.userId })
      .from(users)
      .where(and(
        eq(users.companyId, company.id),
        eq(users.email, String(email).trim().toLowerCase()),
        eq(users.isActive, true)
      ));
    const userIds = rows.map((r) => r.userId).filter(Boolean);
    if (userIds.length > 0) {
      await sendUserIdRecoveryEmail(String(email).trim().toLowerCase(), normalizedCompanyCode, userIds)
        .catch((err: any) => console.error("User ID recovery email failed:", err.message));
    }
    // Always return a generic success response for security.
    return void res.json({ ok: true });
  } catch (error) {
    console.error("Find user id error:", error);
    return void res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", loginAccountLimiter, async (req, res) => {
  try {
    const { companyCode, email, userId, password, code } = req.body ?? {};
    const emailOk = email === undefined || typeof email === "string";
    const userIdOk = userId === undefined || typeof userId === "string";
    if (
      typeof companyCode !== "string" || !companyCode ||
      typeof password !== "string" || !password ||
      !emailOk || !userIdOk || (!email && !userId)
    ) {
      return void res.status(400).json({ error: "companyCode, password, and email or userId are required" });
    }

    const normalizedCode = companyCode.trim().toUpperCase();
    const [company] = await db.select().from(companies)
      .where(eq(companies.companyCode, normalizedCode))
      .limit(1);

    const normalizedUserId = userId ? String(userId).trim().toLowerCase() : "";
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";
    const treatUserIdAsEmail = normalizedUserId.includes("@");

    let user: any | undefined;
    if (company) {
      if (normalizedUserId && !treatUserIdAsEmail) {
        [user] = await db.select().from(users).where(
          and(
            eq(users.companyId, company.id),
            eq(users.userId, normalizedUserId),
            eq(users.isActive, true)
          )
        ).limit(1);
      }

      if (!user) {
        const effectiveEmail = normalizedEmail || (treatUserIdAsEmail ? normalizedUserId : "");
        if (effectiveEmail) {
          [user] = await db.select().from(users).where(
            and(
              eq(users.companyId, company.id),
              eq(users.email, effectiveEmail),
              eq(users.isActive, true)
            )
          ).limit(1);
        }
      }
    }

    // Every way the credentials can be wrong (unknown company, unknown user, wrong password,
    // no membership) gets the same response and costs the same time, so the endpoint can't be
    // used to discover which company codes or users exist.
    let orgMembership: any;
    let credentialsOk = false;
    if (company && user) {
      const valid = await comparePassword(password, user.password);
      [orgMembership] = await db.select().from(organizationUsers)
        .where(and(eq(organizationUsers.userId, user.id), eq(organizationUsers.companyId, company.id), eq(organizationUsers.isActive, true)))
        .limit(1);
      // Fall back to the legacy companyId check
      credentialsOk = valid && (!!orgMembership || user.companyId === company.id);
    } else {
      await burnPasswordCheck(password);
    }
    if (!credentialsOk || !company || !user) {
      return void res.status(401).json({ error: "Invalid credentials" });
    }

    // Only someone who proved they own an account is told it is suspended.
    if (!company.isActive) {
      return void res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "This organization account has been suspended." });
    }

    if (user.isPlatformAdmin && !(await passesMfa(res, user, code))) return;

    const effectiveRole = orgMembership?.role ?? user.role;

    // Self-heal: ensure an organization_users row exists for this user so that
    // isPrimary-based checks work even for accounts created before that table existed.
    if (!orgMembership) {
      await db.insert(organizationUsers).values({
        userId: user.id,
        companyId: company.id,
        role: effectiveRole as any,
        isPrimary: effectiveRole === "MASTER_ADMIN",
        isActive: true,
      }).onConflictDoNothing();
    }

    const authUser: AuthUser = {
      id: user.id,
      userId: user.userId,
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
  // The attributes must match how the cookie was set (SameSite=None; Secure), or browsers
  // ignore the clearing header on a cross-site response and the session cookie survives.
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "none", path: "/" });
  res.json({ success: true });
});

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { organizationName, ein, organizationType, adminName, adminEmail, adminUserId, password } = req.body ?? {};
    if (
      [organizationName, ein, organizationType, adminEmail, adminUserId, password].some(
        (v) => typeof v !== "string" || !v.trim(),
      ) ||
      (adminName !== undefined && adminName !== null && typeof adminName !== "string")
    ) {
      return void res.status(400).json({ error: "Missing required fields" });
    }
    if (!["CHURCH", "MEMBERSHIP", "NONPROFIT"].includes(organizationType)) {
      return void res.status(400).json({ error: "Invalid organization type" });
    }
    if (!adminEmail.includes("@")) {
      return void res.status(400).json({ error: "A valid email address is required" });
    }

    const existingUser = await db.select().from(users).where(
      and(
        eq(users.email, adminEmail.toLowerCase()),
        eq(users.userId, String(adminUserId).trim().toLowerCase())
      )
    ).limit(1);
    if (existingUser.length) {
      // Registration can be retried after previous failures (e.g. schema drift during deploy).
      // If the email already exists and the provided password matches, treat it as a successful login.
      const existing = existingUser[0];
      // This retry path signs the user in, so it must never be a way around the MFA that
      // protects platform-admin accounts.
      if (existing.isPlatformAdmin) {
        return void res.status(400).json({ error: "Email already registered" });
      }
      const valid = await comparePassword(password, existing.password);
      if (!valid) {
        return void res.status(400).json({ error: "Email already registered" });
      }

      const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId)).limit(1);
      if (!company) return void res.status(404).json({ error: "Account company not found" });
      if (!company.isActive) {
        return void res.status(403).json({ error: "ACCOUNT_SUSPENDED", message: "This organization account has been suspended." });
      }

      // Ensure the org membership row exists for org switching.
      await db.insert(organizationUsers).values({
        userId: existing.id,
        companyId: company.id,
        role: existing.role as any,
        isPrimary: true,
        isActive: true,
      }).onConflictDoNothing();

      const authUser: AuthUser = {
        id: existing.id,
        userId: existing.userId,
        email: existing.email,
        name: existing.name,
        role: existing.role,
        companyId: company.id,
        companyName: company.name,
        companyCode: company.companyCode,
        organizationType: company.organizationType,
        isPlatformAdmin: existing.isPlatformAdmin,
      };

      setCookieAndRespond(res, authUser);
      return;
    }

    let companyCode = generateCompanyCode(organizationName);
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(companies).where(eq(companies.companyCode, companyCode)).limit(1);
      if (!existing.length) break;
      companyCode = generateCompanyCode(organizationName);
      attempts++;
    }

    const policyError = passwordPolicyError(password);
    if (policyError) return void res.status(400).json({ error: policyError });

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
      userId: String(adminUserId).trim().toLowerCase(),
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
    await seedChartOfAccounts(company.id, organizationType);

    const { funds } = await import("@workspace/db");
    await db.insert(funds).values({
      companyId: company.id,
      name: "General Fund",
      description: "Default general operating fund",
      isActive: true,
    });

    const authUser: AuthUser = {
      id: user.id,
      userId: user.userId,
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
      return void res.json([{
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
      return void res.status(400).json({ error: "companyId is required" });
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
        return void res.status(403).json({ error: "You do not have access to this organization" });
      }
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company || !company.isActive) {
      return void res.status(403).json({ error: "Organization is not accessible" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return void res.status(404).json({ error: "User not found" });
    // Without this a deactivated user could keep minting fresh 7-day tokens.
    if (!user.isActive) return void res.status(403).json({ error: "This user account is no longer active." });

    const [membership] = await db.select().from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.companyId, companyId)))
      .limit(1);

    const authUser: AuthUser = {
      id: user.id,
      userId: user.userId,
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

// POST /auth/admin-login — dedicated platform admin login (email + password [+ TOTP code], no company code)
// Hard security: only accepts users with isPlatformAdmin = true
router.post("/admin-login", loginAccountLimiter, async (req, res) => {
  try {
    const { email, password, code } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return void res.status(400).json({ error: "Email and password are required." });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.email, email.trim().toLowerCase()),
        eq(users.isPlatformAdmin, true),
        eq(users.isActive, true),
      ))
      .limit(1);

    const denied = {
      error: "ACCESS_DENIED",
      message: "Platform Administrator credentials not recognized.",
    };
    if (!user) {
      await burnPasswordCheck(password);
      return void res.status(401).json(denied);
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return void res.status(401).json(denied);
    }

    // Only revealed after the password is correct, so it can't be used to probe for accounts.
    if (!(await passesMfa(res, user, code))) return;

    const [company] = user.companyId
      ? await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1)
      : [null];

    const authUser: AuthUser = {
      id: user.id,
      userId: user.userId,
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

// ── MFA enrollment (platform admins) ───────────────────────────────────────
router.get("/mfa/status", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const [row] = await db.select({ enabled: users.totpEnabled }).from(users)
      .where(eq(users.id, (req as any).user.id)).limit(1);
    res.json({ enabled: !!row?.enabled, encryptionConfigured: isEncryptionConfigured() });
  } catch (err) {
    console.error("MFA status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Step 1: generate a secret (stored encrypted, not yet active) for the admin to add to an authenticator app.
router.post("/mfa/setup", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const { id, email } = (req as any).user as AuthUser;
    if (!isEncryptionConfigured()) {
      return void res.status(503).json({
        error: "ENCRYPTION_NOT_CONFIGURED",
        message: "Set APP_ENCRYPTION_KEY on the server before enabling multi-factor authentication.",
      });
    }
    const [row] = await db.select({ enabled: users.totpEnabled }).from(users).where(eq(users.id, id)).limit(1);
    if (row?.enabled) {
      return void res.status(400).json({ error: "MFA is already enabled. Disable it first to enroll a new device." });
    }
    const secret = generateTotpSecret();
    await db.update(users)
      .set({ totpSecret: encryptSecret(secret, { required: true }), totpEnabled: false, totpLastStep: null })
      .where(eq(users.id, id));
    res.json({ secret, otpauthUri: otpauthUri(secret, email) });
  } catch (err) {
    console.error("MFA setup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Step 2: prove the app is set up by submitting a current code; only then does MFA become mandatory.
router.post("/mfa/enable", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = (req as any).user as AuthUser;
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row?.totpSecret) return void res.status(400).json({ error: "Start MFA setup first." });
    if (row.totpEnabled) return void res.status(400).json({ error: "MFA is already enabled." });

    const step = verifyTotp(decryptSecret(row.totpSecret), req.body?.code);
    if (step === null) return void res.status(400).json({ error: "That code is not valid. Check your authenticator app and try again." });

    await db.update(users).set({ totpEnabled: true, totpLastStep: step }).where(eq(users.id, user.id));
    logAudit({
      req, companyId: user.companyId || "platform", userId: user.id, userEmail: user.email, userName: user.name,
      action: "MFA_ENABLED", entityType: "USER", entityId: user.id, description: `Multi-factor authentication enabled for ${user.email}`,
    });
    res.json({ enabled: true });
  } catch (err) {
    console.error("MFA enable error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Turning MFA off needs both factors, so a stolen session alone cannot remove it.
router.post("/mfa/disable", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = (req as any).user as AuthUser;
    const { password, code } = req.body ?? {};
    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row?.totpEnabled || !row.totpSecret) return void res.status(400).json({ error: "MFA is not enabled." });
    if (typeof password !== "string" || !(await comparePassword(password, row.password))) {
      return void res.status(403).json({ error: "Your password is incorrect." });
    }
    if (verifyTotp(decryptSecret(row.totpSecret), code, { lastUsedStep: row.totpLastStep }) === null) {
      return void res.status(403).json({ error: "That code is not valid." });
    }
    await db.update(users).set({ totpEnabled: false, totpSecret: null, totpLastStep: null }).where(eq(users.id, user.id));
    logAudit({
      req, companyId: user.companyId || "platform", userId: user.id, userEmail: user.email, userName: user.name,
      action: "MFA_DISABLED", entityType: "USER", entityId: user.id, description: `Multi-factor authentication disabled for ${user.email}`,
    });
    res.json({ enabled: false });
  } catch (err) {
    console.error("MFA disable error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/change-password — signed-in user updates password (requires current password)
router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || typeof currentPassword !== "string") {
      return void res.status(400).json({ error: "Current password is required." });
    }
    const newPasswordError = passwordPolicyError(newPassword);
    if (newPasswordError) {
      return void res.status(400).json({ error: newPasswordError.replace(/^Password/, "New password") });
    }
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      return void res.status(401).json({ error: "Unauthorized" });
    }

    const [row] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      return void res.status(404).json({ error: "User not found" });
    }

    const valid = await comparePassword(currentPassword, row.password);
    if (!valid) {
      return void res.status(401).json({ error: "Current password is incorrect." });
    }

    const hashed = await hashPassword(newPassword);
    const now = new Date();
    await db.update(users).set({ password: hashed, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, userId));

    // Every session issued before now is now invalid (including this one), so hand the
    // caller a fresh token instead of signing them out of the device they just used.
    const token = signToken(toAuthUser((req as any).user as AuthUser));
    setSessionCookie(res, token);
    res.json({ success: true, token });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
