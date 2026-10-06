import { Router } from "express";
import { db, users, passwordResetTokens } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { hashPassword } from "../lib/auth";
import { passwordPolicyError } from "../lib/password";
import { sendPasswordResetEmail } from "../lib/email";
import { getPublicFrontendBase } from "../lib/frontendUrl";

const router = Router();

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string") {
      return void res.status(400).json({ error: "Email is required" });
    }

    // The same email can belong to accounts in several organizations (and email addresses are
    // not verified at signup). Reset every active account that uses it rather than an arbitrary
    // one, so nobody can be locked out of recovery by someone else registering their address.
    const matches = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.isActive, true)))
      .limit(5);

    const base = getPublicFrontendBase(req);
    for (const user of matches) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const resetUrl = `${base}/reset-password?token=${token}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (err: any) {
        console.error("Failed to send reset email:", err.message);
      }
    }

    // Same response whether or not any account matched.
    res.json({ ok: true });
  } catch (err) {
    console.error("Forgot-password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || !token || !password) {
      return void res.status(400).json({ error: "Token and new password are required" });
    }
    const policyError = passwordPolicyError(password);
    if (policyError) {
      return void res.status(400).json({ error: policyError });
    }

    const [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.token, token),
          eq(passwordResetTokens.used, false),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!record) {
      return void res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const hashed = await hashPassword(password);
    const now = new Date();
    // passwordChangedAt signs out every existing session, which is the point of a reset
    // after a suspected compromise.
    await db.update(users).set({ password: hashed, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, record.userId));
    // Burn every outstanding link for this user, not just the one used.
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.userId, record.userId));

    res.json({ ok: true });
  } catch (err) {
    console.error("Reset-password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
