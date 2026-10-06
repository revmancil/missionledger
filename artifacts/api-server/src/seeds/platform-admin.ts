import { db, users, companies, organizationUsers } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Bootstrap-only seed: creates the first platform admin when — and only when — the
 * platform has none.
 *
 * It deliberately never promotes an existing account. Email addresses are not verified at
 * signup, so anyone could register an account with the admin's address first; promoting
 * "whoever holds that email" on boot would hand them the whole platform. It also never
 * re-grants access that was revoked on purpose: once any platform admin exists, this is a
 * no-op.
 */
export async function seedPlatformAdmin() {
  try {
    const [existingAdmin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isPlatformAdmin, true))
      .limit(1);
    if (existingAdmin) return;

    const ADMIN_EMAIL = "icecoldrev06@outlook.com";
    const ADMIN_NAME = "Mancil Carroll";
    const ADMIN_USER_ID = ADMIN_EMAIL.split("@")[0];
    const COMPANY_CODE = "ADMN06";

    const matches = await db.select({ id: users.id }).from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
    if (matches.length > 0) {
      console.error(
        `[seed] No platform admin exists, but an account with ${ADMIN_EMAIL} already exists. ` +
          "Not auto-promoting it (emails are unverified, so it may not belong to the owner). " +
          "If it is yours, promote it manually in the database.",
      );
      return;
    }

    // 1. Ensure company code ADMN06 exists
    const [existingByCode] = await db
      .select()
      .from(companies)
      .where(eq(companies.companyCode, COMPANY_CODE))
      .limit(1);

    let targetCompanyId: string;

    if (existingByCode) {
      targetCompanyId = existingByCode.id;
    } else {
      // Update the first (oldest) company to use the admin code
      const [firstCompany] = await db
        .select()
        .from(companies)
        .orderBy(companies.createdAt)
        .limit(1);

      if (!firstCompany) {
        console.log("[seed] No companies found, skipping platform admin seed.");
        return;
      }

      await db
        .update(companies)
        .set({ companyCode: COMPANY_CODE })
        .where(eq(companies.id, firstCompany.id));

      targetCompanyId = firstCompany.id;
      console.log(`[seed] Updated company code → ${COMPANY_CODE}`);
    }

    // 2. Create the platform admin. No real password is ever hardcoded here: if
    // PLATFORM_ADMIN_BOOTSTRAP_PASSWORD isn't set, generate a random one-time password and
    // require it to be rotated via /forgot-password immediately.
    const bootstrapPassword = process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD || crypto.randomBytes(18).toString("base64url");
    if (!process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD) {
      console.log(`[seed] No PLATFORM_ADMIN_BOOTSTRAP_PASSWORD set. Generated one-time password for ${ADMIN_EMAIL}: ${bootstrapPassword}`);
      console.log("[seed] Rotate this password immediately after first login.");
    }
    const hashed = await bcrypt.hash(bootstrapPassword, 10);
    const [newUser] = await db
      .insert(users)
      .values({
        companyId: targetCompanyId,
        // users.user_id is NOT NULL with no DB default; mirror the convention used by
        // routes/auth.ts and routes/users.ts (lower-cased email).
        userId: ADMIN_USER_ID,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashed,
        role: "MASTER_ADMIN",
        isActive: true,
        isPlatformAdmin: true,
      })
      .returning();

    await db
      .insert(organizationUsers)
      .values({
        userId: newUser.id,
        companyId: targetCompanyId,
        role: "MASTER_ADMIN",
        isPrimary: true,
        isActive: true,
      })
      .onConflictDoNothing();

    console.log(`[seed] Created platform admin: ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error("[seed] Platform admin seed error:", err);
  }
}
