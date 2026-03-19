import { pgTable, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bankTransactionStatusEnum = pgEnum("bank_transaction_status", ["PENDING", "POSTED", "RECONCILED", "VOID"]);
export const bankTransactionTypeEnum = pgEnum("bank_transaction_type", ["DEBIT", "CREDIT"]);

export const bankTransactions = pgTable("bank_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  bankAccountId: text("bank_account_id").notNull(),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  merchantName: text("merchant_name"),
  amount: real("amount").notNull(),
  type: bankTransactionTypeEnum("type").notNull(),
  status: bankTransactionStatusEnum("status").notNull().default("PENDING"),
  fundId: text("fund_id"),
  accountId: text("account_id"),
  journalEntryId: text("journal_entry_id"),
  plaidTransactionId: text("plaid_transaction_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactions.$inferSelect;
