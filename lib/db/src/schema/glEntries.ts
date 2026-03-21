import { pgTable, text, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const glEntryTypeEnum = pgEnum("gl_entry_type", ["DEBIT", "CREDIT"]);
export const glSourceTypeEnum = pgEnum("gl_source_type", [
  "TRANSACTION",
  "JOURNAL_ENTRY",
  "OPENING_BALANCE",
  "MANUAL_JE",
]);
export const glFunctionalTypeEnum = pgEnum("gl_functional_type", [
  "PROGRAM_SERVICE",
  "MANAGEMENT_GENERAL",
  "FUNDRAISING",
]);

export const glEntries = pgTable("gl_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  transactionId: text("transaction_id"),     // null for JE/OB sources
  journalEntryId: text("journal_entry_id"),  // null for TRANSACTION sources
  sourceType: glSourceTypeEnum("source_type").notNull().default("TRANSACTION"),
  accountId: text("account_id").notNull(),
  accountCode: text("account_code").notNull(), // denormalised for fast queries
  accountName: text("account_name").notNull(), // denormalised
  fundId: text("fund_id"),                     // fund this entry belongs to
  fundName: text("fund_name"),                 // denormalised for fast queries
  entryType: glEntryTypeEnum("entry_type").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().$type<number>(),  // always positive
  description: text("description"),
  date: timestamp("date").notNull(),
  isVoid: boolean("is_void").notNull().default(false),
  functionalType: glFunctionalTypeEnum("functional_type"), // 990 classification (nullable)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGlEntrySchema = createInsertSchema(glEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGlEntry = z.infer<typeof insertGlEntrySchema>;
export type GlEntry = typeof glEntries.$inferSelect;
