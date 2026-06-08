import { pgTable, text, numeric, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskStatusEnum = pgEnum("risk_status", ["GREEN", "YELLOW", "RED"]);

export const committeeTypeEnum = pgEnum("committee_type", [
  "FINANCE",
  "AUDIT",
  "GOVERNANCE",
  "EXECUTIVE",
  "PROGRAM",
  "OTHER",
]);

/** Quarterly mission / program KPIs tracked for board reporting. */
export const programMetrics = pgTable("program_metrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  periodYear: integer("period_year").notNull(),
  periodQuarter: integer("period_quarter").notNull(),
  targetValue: numeric("target_value", { precision: 15, scale: 2, mode: "number" }).notNull().default(0).$type<number>(),
  actualValue: numeric("actual_value", { precision: 15, scale: 2, mode: "number" }).notNull().default(0).$type<number>(),
  unit: text("unit"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const strategicRisks = pgTable("strategic_risks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: riskStatusEnum("status").notNull().default("GREEN"),
  ownerName: text("owner_name"),
  reviewDate: timestamp("review_date"),
  mitigation: text("mitigation"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const committeeUpdates = pgTable("committee_updates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  committeeType: committeeTypeEnum("committee_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  meetingDate: timestamp("meeting_date"),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProgramMetricSchema = createInsertSchema(programMetrics).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertStrategicRiskSchema = createInsertSchema(strategicRisks).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertCommitteeUpdateSchema = createInsertSchema(committeeUpdates).omit({
  id: true, createdAt: true, updatedAt: true,
});
