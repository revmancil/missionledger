import { pgTable, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billStatusEnum = pgEnum("bill_status", ["PENDING", "PARTIAL", "PAID", "VOID"]);

export const bills = pgTable("bills", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  vendorId: text("vendor_id"),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  dueDate: timestamp("due_date").notNull(),
  status: billStatusEnum("status").notNull().default("PENDING"),
  accountId: text("account_id"),
  fundId: text("fund_id"),
  journalEntryId: text("journal_entry_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const billPayments = pgTable("bill_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  billId: text("bill_id").notNull(),
  companyId: text("company_id").notNull(),
  amount: real("amount").notNull(),
  date: timestamp("date").notNull(),
  cashAccountId: text("cash_account_id"),
  journalEntryId: text("journal_entry_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBillSchema = createInsertSchema(bills).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof bills.$inferSelect;

export const insertBillPaymentSchema = createInsertSchema(billPayments).omit({ id: true, createdAt: true });
export type InsertBillPayment = z.infer<typeof insertBillPaymentSchema>;
export type BillPayment = typeof billPayments.$inferSelect;
