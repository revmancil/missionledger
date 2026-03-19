import { pgTable, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const journalEntryStatusEnum = pgEnum("journal_entry_status", ["DRAFT", "POSTED", "VOID"]);

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  entryNumber: text("entry_number").notNull(),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  memo: text("memo"),
  referenceNumber: text("reference_number"),
  status: journalEntryStatusEnum("status").notNull().default("DRAFT"),
  createdBy: text("created_by"),
  postedAt: timestamp("posted_at"),
  voidedAt: timestamp("voided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const journalEntryLines = pgTable("journal_entry_lines", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  journalEntryId: text("journal_entry_id").notNull(),
  companyId: text("company_id").notNull(),
  accountId: text("account_id").notNull(),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  description: text("description"),
  fundId: text("fund_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLines).omit({ id: true, createdAt: true });
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
