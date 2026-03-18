import { pgTable, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coaTypeEnum = pgEnum("coa_type", ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);

export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: coaTypeEnum("coa_type").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertChartOfAccountSchema = createInsertSchema(chartOfAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
