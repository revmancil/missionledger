import { pgTable, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pledgeStatusEnum = pgEnum("pledge_status", ["ACTIVE", "FULFILLED", "CANCELLED", "DEFAULTED"]);
export const pledgeFrequencyEnum = pgEnum("pledge_frequency", ["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "ONE_TIME"]);

export const pledges = pgTable("pledges", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  donorName: text("donor_name").notNull(),
  donorEmail: text("donor_email"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2, mode: "number" }).notNull().$type<number>(),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2, mode: "number" }).notNull().default("0").$type<number>(),
  pledgeDate: timestamp("pledge_date").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  frequency: pledgeFrequencyEnum("frequency"),
  fundId: text("fund_id"),
  status: pledgeStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPledgeSchema = createInsertSchema(pledges).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPledge = z.infer<typeof insertPledgeSchema>;
export type Pledge = typeof pledges.$inferSelect;
