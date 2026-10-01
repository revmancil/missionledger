import { db, users, companies, organizationUsers } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Idempotent seed: ensures the platform admin account exists with the correct
 * company code and email. Runs on every server startup but is a no-op once set.
 */
export async function seedPlatformAdmin() {
  try {
    const ADMIN_EMAIL = "icecoldrev06@outlook.com";
    const ADMIN_NAME = "Mancil Carroll";
    const ADMIN_USER_ID = ADMIN_EMAIL.split("@")[0];
    const COMPANY_CODE = "ADMN06";

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

    // 2. Ensure the admin email account exists and is a platform admin
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);

    if (existingUser) {
      // Just ensure flags are correct
      if (!existingUser.isPlatformAdmin || existingUser.role !== "MASTER_ADMIN") {
        await db
          .update(users)
          .set({ isPlatformAdmin: true, role: "MASTER_ADMIN" })
          .where(eq(users.email, ADMIN_EMAIL));
        console.log("[seed] Updated platform admin flags on existing user.");
      }
    } else {
      // Create the platform admin user. No real password is ever hardcoded here:
      // if PLATFORM_ADMIN_BOOTSTRAP_PASSWORD isn't set, generate a random one-time
      // password and require it to be rotated via /forgot-password immediately.
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

      // Add to organization_users
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
    }
  } catch (err) {
    console.error("[seed] Platform admin seed error:", err);
  }
}
