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
