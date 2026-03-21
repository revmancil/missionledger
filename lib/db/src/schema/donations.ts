import { pgTable, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const donationTypeEnum = pgEnum("donation_type", ["CASH", "CHECK", "ONLINE", "IN_KIND", "OTHER"]);

export const donations = pgTable("donations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  donorName: text("donor_name").notNull(),
  donorEmail: text("donor_email"),
  amount: numeric("amount", { precision: 15, scale: 2, mode: "number" }).notNull().$type<number>(),
  date: timestamp("date").notNull(),
  type: donationTypeEnum("type").notNull().default("CASH"),
  fundId: text("fund_id"),
  accountId: text("account_id"),
  cashAccountId: text("cash_account_id"),
  journalEntryId: text("journal_entry_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDonationSchema = createInsertSchema(donations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donations.$inferSelect;
