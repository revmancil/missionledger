import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { apiLimiter, cspReportLimiter } from "./lib/rateLimiters";
import { globalErrorHandler } from "./lib/errorHandler";
import { allowedOrigins } from "./lib/origins";

const app: Express = express();

// Behind Render's load balancer, req.ip is the proxy's address unless Express is told how
// many proxy hops to trust — which makes every client share the same rate-limit buckets.
// Trust exactly N hops (never `true`: that lets clients forge X-Forwarded-For and dodge
// the limiters). Raise TRUST_PROXY_HOPS only after confirming how many proxies sit in
// front of the API; see the verification steps in the deploy notes.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10);
app.set("trust proxy", Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

// Safety net for every res.json(): credentials stored in the database must never reach a
// browser, even if a route forgets to strip them from a row it returns.
const NEVER_SERIALIZE = new Set(["plaidAccessToken", "totpSecret", "zeffyWebhookSecret", "password"]);
app.set("json replacer", (key: string, value: unknown) => (NEVER_SERIALIZE.has(key) ? undefined : value));

// This is a pure JSON API, never same-origin with its frontend, so cross-origin
// resource policy must stay permissive — the `cors` middleware below is what
// actually restricts who can call it.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Also the CSRF defense: SameSite=None session cookies ride along on cross-site requests, but
// browsers always send an Origin header on cross-site POSTs, and this rejects any that is not
// allow-listed (see lib/origins.ts).
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(Object.assign(new Error("Not allowed by CORS"), { status: 403 }));
    }
  },
  credentials: true,
}));

// Content-Security-Policy-Report-Only violations from the frontend (see vercel.json). Logged
// so the policy can be tightened safely. URLs are stripped of query strings and fragments:
// pages like /reset-password?token=... must never end up in the logs.
const stripUrl = (v: unknown) => String(v ?? "").split(/[?#]/, 1)[0].slice(0, 200);
app.post(
  "/api/csp-report",
  cspReportLimiter,
  express.json({ type: ["application/csp-report", "application/reports+json", "application/json"], limit: "16kb" }),
  (req, res) => {
    const reports = Array.isArray(req.body) ? req.body : [req.body];
    for (const r of reports.slice(0, 5)) {
      const v = r?.["csp-report"] ?? r?.body ?? r ?? {};
      console.warn("[csp-violation]", JSON.stringify({
        directive: String(v["violated-directive"] ?? v.effectiveDirective ?? "").slice(0, 80),
        blocked: stripUrl(v["blocked-uri"] ?? v.blockedURL),
        page: stripUrl(v["document-uri"] ?? v.documentURL),
        source: stripUrl(v["source-file"] ?? v.sourceFile),
      }));
    }
    res.status(204).end();
  },
);

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return void res.status(400).json({ error: "Missing stripe-signature header" });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// Zeffy signs each delivery with an HMAC over the raw body bytes, so this path must
// be captured as a Buffer before the global express.json() below consumes the stream.
// Re-serializing parsed JSON would reorder keys and break signature verification.
app.use("/api/zeffy/webhook", express.raw({ type: "*/*" }));

app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());
app.use("/api", apiLimiter, router);

// Must be registered after all routes: Express identifies error-handling
// middleware by its 4-argument signature.
app.use(globalErrorHandler);

export default app;