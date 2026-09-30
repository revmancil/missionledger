import { Router } from "express";
import { db, donations, companies } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// Zeffy signs every webhook delivery:
//   Zeffy-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "{t}.{rawBody}">
// The signing secret ("whsec_...") is per-organization and is configured by the org
// admin on the organization settings page. It is scoped per org so that one leaked
// secret cannot be used to forge donations into every other tenant.
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Only successful payment events may create a donation. contact.*, payment.updated and
// payment.deleted must never create one (they would double-count or resurrect revenue).
const DONATION_EVENTS = new Set(["payment.completed", "payment.created"]);

function parseSignatureHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

/** Constant-time verification of a Zeffy-Signature header against the raw body bytes. */
export function isZeffySignatureValid(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  const timestamp = Number(t);
  if (!t || !v1 || !Number.isFinite(timestamp)) return false;

  // Reject stale deliveries so a captured request cannot be replayed later.
  if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest();

  const received = Buffer.from(v1, "hex");
  // timingSafeEqual throws when lengths differ, so compare lengths first.
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// Zeffy sends a webhook POST when a payment happens.
router.post("/webhook", async (req, res) => {
  try {
    const companyCode = typeof req.query.org === "string" ? req.query.org.trim() : "";
    if (!companyCode) return void res.status(400).json({ error: "Missing org" });

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.companyCode, companyCode))
      .limit(1);
    if (!company) return void res.status(404).json({ error: "Organization not found" });
    if (!company.donationsEnabled) return void res.status(403).json({ error: "Donations not enabled" });

    // Raw bytes are required for verification. The route is mounted with express.raw()
    // in app.ts so req.body is a Buffer; re-serializing parsed JSON would reorder keys
    // and change whitespace, producing a different signature.
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(
          typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
          "utf8",
        );

    if (!company.zeffyWebhookSecret) {
      // Fail closed. Without a stored secret, any caller could forge donations into
      // this organization's books.
      console.error(
        `Zeffy webhook rejected: no signing secret configured for company ${company.id}. ` +
          "Set the Zeffy webhook signing secret (whsec_...) in organization settings.",
      );
      return void res.status(503).json({ error: "Webhook not configured" });
    }

    const signature = req.get("Zeffy-Signature") ?? undefined;
    if (!isZeffySignatureValid(rawBody, signature, company.zeffyWebhookSecret)) {
      console.warn(`Zeffy webhook rejected: invalid signature for company ${company.id}`);
      return void res.status(400).json({ error: "Invalid signature" });
    }

    // Signature verified — only now is it safe to parse untrusted input.
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return void res.status(400).json({ error: "Invalid JSON" });
    }

    // Documented envelope is { event, data }. Fall back to the flat shape for older
    // test payloads so existing configurations keep working.
    const eventType = String(payload?.event ?? payload?.type ?? payload?.eventType ?? "");
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;

    if (eventType && !DONATION_EVENTS.has(eventType)) {
      // Acknowledge so Zeffy stops retrying, but do not touch the ledger.
      return void res.json({ received: true, ignored: eventType });
    }

    const status = String(data?.status ?? "").toLowerCase();
    if (status && status !== "succeeded") {
      // Pending / failed payments are not revenue.
      return void res.json({ received: true, ignored: `status:${status}` });
    }

    // Idempotency key. Prefer the payment id so that payment.created followed by
    // payment.completed for the same payment collapses into a single donation; fall
    // back to the event id, which is stable across Zeffy's retries (up to 3 days).
    const externalId = String(
      data?.id ?? data?.paymentId ?? payload?.id ?? payload?.event_id ?? "",
    ).trim();

    if (externalId) {
      const [existing] = await db
        .select({ id: donations.id })
        .from(donations)
        .where(
          and(eq(donations.companyId, company.id), eq(donations.zeffyEventId, externalId)),
        )
        .limit(1);
      if (existing) {
        return void res.json({ received: true, duplicate: true });
      }
    }

    const donorName =
      [data?.firstName, data?.lastName].filter(Boolean).join(" ") ||
      data?.email ||
      data?.contact?.email ||
      "Anonymous";
    const amount = parseFloat(String(data?.amount ?? data?.totalAmount ?? "0"));
    const donorEmail = data?.email ?? data?.contact?.email ?? null;
    const parsedDate = data?.createdAt ? new Date(data.createdAt) : null;
    const date = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
    const notes = data?.fundDesignation || data?.message || null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return void res.status(400).json({ error: "Invalid amount" });
    }

    try {
      await db.insert(donations).values({
        companyId: company.id,
        donorName,
        donorEmail,
        amount,
        date,
        type: "ONLINE",
        notes,
        zeffyEventId: externalId || null,
      });
    } catch (err: any) {
      // Unique violation on (company_id, zeffy_event_id) means a concurrent delivery of
      // the same event won the race. Acknowledge as a duplicate instead of returning a
      // 5xx, which would make Zeffy redeliver for up to 3 days.
      const code = err?.code ?? err?.cause?.code;
      if (code === "23505") {
        return void res.json({ received: true, duplicate: true });
      }
      throw err;
    }

    // Deliberately no donor PII in logs.
    console.log(`Zeffy donation recorded for company ${company.id}: $${amount.toFixed(2)}`);
    res.json({ received: true });
  } catch (error) {
    console.error("Zeffy webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Public endpoint — no auth required
router.get("/public-info", async (req, res) => {
  try {
    const org = req.query.org as string;
    if (!org) return void res.status(400).json({ error: "Missing org" });
    const [company] = await db.select().from(companies).where(eq(companies.companyCode, org));
    if (!company || !company.donationsEnabled) return void res.status(404).json({ error: "Not found" });
    res.json({ orgName: company.name, zeffyFormUrl: company.zeffyFormUrl });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
