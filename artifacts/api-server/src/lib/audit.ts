import { db, auditLogs } from "@workspace/db";
import { Request } from "express";

export interface AuditParams {
  req?: Request;
  companyId: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "VOID" | "LOGIN" | "LOGOUT" | "PERIOD_CLOSE" | "PERIOD_REOPEN" | "RESTORE";
  entityType: "TRANSACTION" | "JOURNAL_ENTRY" | "ACCOUNT" | "FUND" | "USER" | "SESSION" | "PERIOD" | "OPENING_BALANCE";
  entityId?: string | null;
  description: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/** Fire-and-forget audit writer — never throws. */
export function logAudit(params: AuditParams): void {
  const {
    req, companyId, userId, userEmail, userName,
    action, entityType, entityId, description,
    oldValue, newValue,
  } = params;

  const ipAddress = req
    ? (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress
      ?? null
    : null;

  db.insert(auditLogs).values({
    companyId,
    userId,
    userEmail: userEmail ?? null,
    userName: userName ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    description,
    oldValue: oldValue ? JSON.stringify(oldValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
    ipAddress,
  }).catch((err) => {
    console.error("[Audit] Failed to write log:", err?.message ?? err);
  });
}

/** Snapshot helper — strips internal Drizzle cruft, converts dates to strings. */
export function snap(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}
