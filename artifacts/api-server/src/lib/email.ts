import { Resend } from "resend";

const FROM_EMAIL = process.env.EMAIL_FROM || "MissionLedger <noreply@missionledger.app>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function send(opts: { to: string; subject: string; html: string }): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(`📧 [EMAIL — no RESEND_API_KEY configured] To: ${opts.to} | Subject: ${opts.subject}`);
    return;
  }
  await resend.emails.send({ from: FROM_EMAIL, to: [opts.to], subject: opts.subject, html: opts.html });
}

export async function sendWelcomeEmail(toEmail: string, orgName: string, trialDays = 14): Promise<void> {
  await send({
    to: toEmail,
    subject: `Welcome to MissionLedger — your 14-day trial is active`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
        <div style="margin-bottom: 28px;">
          <span style="font-size: 20px; font-weight: 700; color: #1b3a6b;">MissionLedger</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 12px;">Welcome, ${orgName}! 🎉</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          Your organization's account is ready. You have a <strong>${trialDays}-day free trial</strong> to explore everything MissionLedger has to offer — Bank Register, Fund Accounting, Journal Entries, Reports, and more.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          When you're ready to continue after your trial, head to <strong>Billing</strong> in your sidebar to choose a plan.
        </p>
        <p style="color: #999; font-size: 13px; margin: 28px 0 0; line-height: 1.5;">
          Questions? Reply to this email — we're happy to help.
        </p>
      </div>
    `,
  });
}

export async function sendSubscriptionConfirmedEmail(toEmail: string, orgName: string): Promise<void> {
  await send({
    to: toEmail,
    subject: "Your MissionLedger subscription is confirmed",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
        <div style="margin-bottom: 28px;">
          <span style="font-size: 20px; font-weight: 700; color: #1b3a6b;">MissionLedger</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 12px;">Subscription confirmed ✓</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          Thank you, <strong>${orgName}</strong>! Your MissionLedger subscription is now active. Full access to all features has been unlocked.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          You can manage your subscription, update payment methods, or download invoices anytime from the <strong>Billing</strong> section in your dashboard.
        </p>
        <p style="color: #999; font-size: 13px; margin: 28px 0 0; line-height: 1.5;">
          Questions? Reply to this email — we're happy to help.
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const resend = getResend();

  if (!resend) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 PASSWORD RESET LINK (no email service configured):");
    console.log(resetUrl);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  await send({
    to: toEmail,
    subject: "Reset your MissionLedger password",
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
        <div style="margin-bottom: 28px;">
          <span style="font-size: 20px; font-weight: 700; color: #1b3a6b;">MissionLedger</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 12px;">Reset your password</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          We received a request to reset the password for your MissionLedger account. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}"
          style="display: inline-block; background: #1b3a6b; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">
          Reset Password
        </a>
        <p style="color: #999; font-size: 13px; margin: 28px 0 0; line-height: 1.5;">
          If you didn't request a password reset, you can safely ignore this email. Your password will not change.<br><br>
          Or copy this link into your browser:<br>
          <a href="${resetUrl}" style="color: #1b3a6b; word-break: break-all;">${resetUrl}</a>
        </p>
      </div>
    `,
  });
}
