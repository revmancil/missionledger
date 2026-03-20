import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const helpMessageDirectionEnum = ["USER_TO_ADMIN", "ADMIN_TO_USER"] as const;

export const helpMessages = pgTable("help_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  subject: text("subject").notNull().default("Help Request"),
  body: text("body").notNull(),
  direction: text("direction").notNull().default("USER_TO_ADMIN"),
  isRead: boolean("is_read").notNull().default(false),
  parentId: text("parent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type HelpMessage = typeof helpMessages.$inferSelect;
export type NewHelpMessage = typeof helpMessages.$inferInsert;
