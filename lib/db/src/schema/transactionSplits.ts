import { pgTable, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionSplits = pgTable("transaction_splits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionId: text("transaction_id").notNull(),
  chartAccountId: text("chart_account_id"),
  vendorId: text("vendor_id"),
  amount: numeric("amount", { precision: 15, scale: 2, mode: "number" }).notNull().$type<number>(),
  memo: text("memo"),
  functionalType: text("functional_type"), // 990 tag: PROGRAM_SERVICE | MANAGEMENT_GENERAL | FUNDRAISING
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransactionSplitSchema = createInsertSchema(transactionSplits).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertTransactionSplit = z.infer<typeof insertTransactionSplitSchema>;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
