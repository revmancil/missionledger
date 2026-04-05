import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizationTypeEnum = pgEnum("organization_type", ["CHURCH", "MEMBERSHIP", "NONPROFIT"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["ACTIVE", "INACTIVE", "TRIAL", "CANCELLED"]);
export const roleEnum = pgEnum("role", ["MASTER_ADMIN", "ADMIN", "VIEWER", "PASTOR", "OFFICER"]);
export const accountingMethodEnum = pgEnum("accounting_method", ["CASH", "ACCRUAL"]);

export const companies = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyCode: text("company_code").notNull().unique(),
  name: text("name").notNull(),
  dba: text("dba"),
  ein: text("ein").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  organizationType: organizationTypeEnum("organization_type").notNull().default("NONPROFIT"),
  isActive: boolean("is_active").notNull().default(true),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("TRIAL"),
  defaultFundId: text("default_fund_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  accountingMethod: accountingMethodEnum("accounting_method").notNull().default("CASH"),
  openingBalanceEntryId: text("opening_balance_entry_id"),
  openingBalanceDate: timestamp("opening_balance_date"),
  closedUntil: timestamp("closed_until"),
  fiscalYearEndMonth: text("fiscal_year_end_month").notNull().default("12"),
  donationsEnabled: boolean("donations_enabled").notNull().default(false),
  zeffyFormUrl: text("zeffy_form_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;
