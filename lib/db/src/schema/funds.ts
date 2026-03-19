import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fundTypeEnum = pgEnum("fund_type", [
  "UNRESTRICTED",
  "RESTRICTED_TEMP",
  "RESTRICTED_PERM",
  "BOARD_DESIGNATED",
]);

export const funds = pgTable("funds", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fundType: fundTypeEnum("fund_type").notNull().default("UNRESTRICTED"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFundSchema = createInsertSchema(funds).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFund = z.infer<typeof insertFundSchema>;
export type Fund = typeof funds.$inferSelect;
