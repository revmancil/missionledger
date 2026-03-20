import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  userName: text("user_name"),
  action: text("action").notNull(),         // CREATE | UPDATE | DELETE | LOGIN | PERIOD_CLOSE | VOID
  entityType: text("entity_type"),           // TRANSACTION | JOURNAL_ENTRY | ACCOUNT | FUND | USER | SESSION
  entityId: text("entity_id"),
  description: text("description").notNull(),
  oldValue: text("old_value"),               // JSON snapshot before change
  newValue: text("new_value"),               // JSON snapshot after change
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
