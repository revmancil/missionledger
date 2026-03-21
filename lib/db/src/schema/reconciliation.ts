import { pgTable, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["IN_PROGRESS", "COMPLETED", "VOID"]);

export const reconciliations = pgTable("reconciliations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  bankAccountId: text("bank_account_id").notNull(),
  statementDate: timestamp("statement_date").notNull(),
  statementBalance: numeric("statement_balance", { precision: 15, scale: 2 }).notNull().$type<number>(),
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull().default("0").$type<number>(),
  clearedBalance: numeric("cleared_balance", { precision: 15, scale: 2 }).$type<number>(),
  difference: numeric("difference", { precision: 15, scale: 2 }).$type<number>(),
  status: reconciliationStatusEnum("status").notNull().default("IN_PROGRESS"),
  reconciledBy: text("reconciled_by"),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const reconciliationItems = pgTable("reconciliation_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reconciliationId: text("reconciliation_id").notNull(),
  bankTransactionId: text("bank_transaction_id"),
  transactionId: text("transaction_id"),
  cleared: boolean("cleared").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReconciliationSchema = createInsertSchema(reconciliations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReconciliation = z.infer<typeof insertReconciliationSchema>;
export type Reconciliation = typeof reconciliations.$inferSelect;

export const insertReconciliationItemSchema = createInsertSchema(reconciliationItems).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReconciliationItem = z.infer<typeof insertReconciliationItemSchema>;
export type ReconciliationItem = typeof reconciliationItems.$inferSelect;
