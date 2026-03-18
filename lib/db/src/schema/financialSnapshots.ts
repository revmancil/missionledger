import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const snapshotTypeEnum = pgEnum("snapshot_type", [
  "STATEMENT_OF_ACTIVITIES",
  "BALANCE_SHEET",
  "PERIOD_CLOSE",
  "YEAR_END_CLOSE",
]);

export const snapshotStatusEnum = pgEnum("snapshot_status", ["DRAFT", "FINALIZED"]);

export const financialSnapshots = pgTable("financial_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  snapshotType: snapshotTypeEnum("snapshot_type").notNull(),
  periodLabel: text("period_label").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  data: text("data").notNull(),
  status: snapshotStatusEnum("snapshot_status").notNull().default("FINALIZED"),
  closingJournalEntryId: text("closing_journal_entry_id"),
  closedBy: text("closed_by").notNull(),
  closedByEmail: text("closed_by_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFinancialSnapshotSchema = createInsertSchema(financialSnapshots).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinancialSnapshot = z.infer<typeof insertFinancialSnapshotSchema>;
export type FinancialSnapshot = typeof financialSnapshots.$inferSelect;
