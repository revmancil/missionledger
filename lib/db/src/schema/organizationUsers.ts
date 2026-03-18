import { pgTable, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { roleEnum } from "./companies";

export const organizationUsers = pgTable("organization_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  companyId: text("company_id").notNull(),
  role: roleEnum("role").notNull().default("VIEWER"),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  invitedBy: text("invited_by"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("org_users_user_company_unique").on(t.userId, t.companyId),
]);

export type OrganizationUser = typeof organizationUsers.$inferSelect;
