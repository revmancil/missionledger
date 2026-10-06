import type { ErrorRequestHandler } from "express";

export function exposeErrorDetails(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ML_EXPOSE_ERROR_DETAILS === "1" ||
    process.env.ML_EXPOSE_ERROR_DETAILS === "true"
  );
}

/**
 * Last-resort catch-all for anything that reaches Express without being caught
 * by a route's own try/catch — a thrown error in synchronous middleware, or an
 * async handler that forgot to catch. Without this, an uncaught error falls
 * through to Express's own default handler, which can leak stack traces to the
 * client depending on NODE_ENV, and isn't logged anywhere consistent.
 */
const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: "Bad request",
  403: "Origin not allowed",
  413: "Request body too large",
};

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;

  // Errors that carry a 4xx status (a CORS rejection, malformed JSON, an oversized body)
  // are the client's fault; reporting them as 500s hides that and pollutes error monitoring.
  const status = Number(err?.status ?? err?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    res.status(status).json({ error: CLIENT_ERROR_MESSAGES[status] ?? "Bad request" });
    return;
  }

  console.error("Unhandled error:", err);
  const details = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: "Internal server error",
    ...(exposeErrorDetails()
      ? { details }
      : { hint: "To see the underlying error in API responses, set ML_EXPOSE_ERROR_DETAILS=1 on the server and redeploy." }),
  });
};
