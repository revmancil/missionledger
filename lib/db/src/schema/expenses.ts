import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  date: timestamp("date").notNull(),
  category: text("category").notNull(),
  fundId: text("fund_id"),
  accountId: text("account_id"),
  cashAccountId: text("cash_account_id"),
  vendorId: text("vendor_id"),
  journalEntryId: text("journal_entry_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;
