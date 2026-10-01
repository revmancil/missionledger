import { pgTable, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** A named giving goal (e.g. "Building Fund") that individual pledges can optionally roll up under. */
export const pledgeCampaigns = pgTable("pledge_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fundId: text("fund_id"),
  goalAmount: numeric("goal_amount", { precision: 15, scale: 2, mode: "number" }).notNull().$type<number>(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPledgeCampaignSchema = createInsertSchema(pledgeCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPledgeCampaign = z.infer<typeof insertPledgeCampaignSchema>;
export type PledgeCampaign = typeof pledgeCampaigns.$inferSelect;
