import { pgTable, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { coaTypeEnum } from "./chartOfAccounts";
import { organizationTypeEnum } from "./companies";

/**
 * Platform-admin-editable chart-of-accounts starting templates, one set per
 * organization type. Read by seedChartOfAccounts() at signup. `code` is only
 * unique within a given organizationType — the same code (e.g. "4100") can
 * mean something different in the NONPROFIT vs CHURCH template.
 */
export const coaTemplates = pgTable("coa_templates", {
  organizationType: organizationTypeEnum("organization_type").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: coaTypeEnum("type").notNull(),
  parentCode: text("parent_code"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  uniqueIndex("coa_templates_org_type_code_unique").on(t.organizationType, t.code),
]);

export const insertCoaTemplateSchema = createInsertSchema(coaTemplates);
export type InsertCoaTemplate = z.infer<typeof insertCoaTemplateSchema>;
export type CoaTemplate = typeof coaTemplates.$inferSelect;
