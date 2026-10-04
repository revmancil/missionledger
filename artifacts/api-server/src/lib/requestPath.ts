/**
 * Path portion of a request URL (no query string or fragment), lowercased because
 * Express routes case-insensitively by default.
 *
 * Authorization decisions must be made on this, never on the raw URL: a substring
 * or prefix test on the full URL can be satisfied by an attacker-controlled query
 * string (e.g. "/api/transactions?x=/api/stripe").
 */
export function requestPath(originalUrl: string | undefined): string {
  return (originalUrl ?? "").split(/[?#]/, 1)[0].toLowerCase();
}

/** True when `path` is exactly `prefix` or a sub-path of it ("/api/auth" matches "/api/auth/me", not "/api/authx"). */
export function pathIsOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

const SUBSCRIPTION_EXEMPT_PREFIXES = ["/api/stripe", "/api/auth", "/api/healthz"];

/** Billing, auth and health routes stay reachable so an expired-trial user can sign in and pay. */
export function isSubscriptionExemptPath(originalUrl: string | undefined): boolean {
  const path = requestPath(originalUrl);
  return SUBSCRIPTION_EXEMPT_PREFIXES.some((p) => pathIsOrUnder(path, p));
}
