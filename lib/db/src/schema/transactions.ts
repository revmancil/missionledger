import { pgTable, text, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionTypeEnum = pgEnum("transaction_type", ["DEBIT", "CREDIT"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["UNCLEARED", "CLEARED", "RECONCILED", "VOID"]);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  bankAccountId: text("bank_account_id"),
  date: timestamp("date").notNull(),
  payee: text("payee").notNull(),
  vendorId: text("vendor_id"),
  amount: numeric("amount", { precision: 15, scale: 2, mode: "number" }).notNull().$type<number>(),
  type: transactionTypeEnum("transaction_type").notNull().default("DEBIT"),
  status: transactionStatusEnum("transaction_status").notNull().default("UNCLEARED"),
  chartAccountId: text("chart_account_id"),
  isSplit: boolean("is_split").notNull().default(false),
  memo: text("memo"),
  checkNumber: text("check_number"),
  referenceNumber: text("reference_number"),
  fundId: text("fund_id"),
  journalEntryId: text("journal_entry_id"),
  plaidTransactionId: text("plaid_transaction_id"),
  isVoid: boolean("is_void").notNull().default(false),
  donorName: text("donor_name"),
  functionalType: text("functional_type"), // 990 tag: PROGRAM_SERVICE | MANAGEMENT_GENERAL | FUNDRAISING
  transactionFingerprint: text("transaction_fingerprint"), // duplicate-detection: "{amount}_{date}_{payee}"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
