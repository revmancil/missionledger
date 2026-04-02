import type { Request } from "express";

/**
 * Public URL of the SPA (scheme + host + optional path prefix, no trailing slash).
 * Required for correct Stripe redirects and password-reset links when the API is on a
 * different host than the frontend (e.g. Render API + Vercel or custom domain).
 *
 * Examples: https://app.example.com  or  https://example.com/missionledger
 */
export function getPublicFrontendBase(req: Request): string {
  const fromEnv = process.env.FRONTEND_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (domain) return `https://${domain}`;

  return `${req.protocol}://${req.get("host")}`;
}
