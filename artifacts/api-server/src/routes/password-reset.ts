import { Router } from "express";
import { db, users, passwordResetTokens } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { hashPassword } from "../lib/auth";
import { sendPasswordResetEmail } from "../lib/email";
import { getPublicFrontendBase } from "../lib/frontendUrl";

const router = Router();

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string") {
      return void res.status(400).json({ error: "Email is required" });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return void res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
    });

    const base = getPublicFrontendBase(req);
    const resetUrl = `${base}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err: any) {
      console.error("Failed to send reset email:", err.message);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Forgot-password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body ?? {};
    if (!token || !password) {
      return void res.status(400).json({ error: "Token and new password are required" });
    }
    if (password.length < 8) {
      return void res.status(400).json({ error: "Password must be at least 8 characters" });
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
