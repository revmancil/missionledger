import rateLimit from "express-rate-limit";

/** Generic ceiling on all API traffic — generous enough for normal dashboard use, just anti-abuse. */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Tighter limit for auth-sensitive endpoints (login, password reset, user-id
 * recovery) — the prime targets for credential stuffing, reset-token brute
 * forcing, and mail-bomb abuse via unauthenticated, unthrottled endpoints.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/**
 * Per-account throttle on failed sign-ins. Keyed on the account being attacked rather
 * than the caller's IP, so it holds no matter how many addresses a credential-stuffing
 * run comes from (and no matter how the proxy chain reports client IPs). Only failed
 * attempts count, so normal logins never consume the budget.
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const company = String(body.companyCode ?? "").trim().toUpperCase();
    const identity = String(body.userId ?? body.email ?? "").trim().toLowerCase();
    return `login:${company}:${identity}`;
  },
  message: { error: "Too many failed sign-in attempts for this account. Please try again in 15 minutes." },
});
