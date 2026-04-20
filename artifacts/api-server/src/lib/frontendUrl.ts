import type { Request } from "express";

function firstEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]?.trim().replace(/\/$/, "");
    if (v) return v;
  }
  return undefined;
}

/**
 * Public URL of the SPA (scheme + host + optional path prefix, no trailing slash).
 * Required when the API is on a different host than the app (e.g. Render API + custom
 * domain like missionledger.fund). Without FRONTEND_URL, email links and Stripe redirects
 * would incorrectly use the API hostname.
 *
 * Examples: https://app.example.com  or  https://example.com/missionledger
 */
export function getPublicFrontendBase(req: Request): string {
  const fromEnv = firstEnv("FRONTEND_URL", "PUBLIC_SITE_URL");
  if (fromEnv) return fromEnv;

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (domain) return `https://${domain}`;

  const host = req.get("host") ?? "";
  const fallback = `${req.protocol}://${host}`;
  if (process.env.NODE_ENV === "production" && /\.onrender\.com$/i.test(host)) {
    console.warn(
      "[frontendUrl] FRONTEND_URL is unset; public links use the API host (%s). Set FRONTEND_URL to your live site URL (e.g. https://missionledger.fund).",
      fallback,
    );
  }
  return fallback;
}
