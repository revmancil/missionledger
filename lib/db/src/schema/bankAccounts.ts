import { pgTable, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull().default("CHECKING"),
  lastFour: text("last_four"),
  currentBalance: numeric("current_balance", { precision: 15, scale: 2 }).notNull().default("0").$type<number>(),
  glAccountId: text("gl_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  plaidAccessToken: text("plaid_access_token"),
  plaidItemId: text("plaid_item_id"),
  plaidInstitutionName: text("plaid_institution_name"),
  isPlaidLinked: boolean("is_plaid_linked").notNull().default(false),
  plaidLastSyncedAt: timestamp("plaid_last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBankAccountSchema = createInsertSchema(bankAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccounts.$inferSelect;
