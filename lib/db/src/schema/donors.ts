import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * A real giver/member record — distinct from the free-text donorName fields on
 * donations/pledges/transactions, which stay as-is for backward compatibility.
 * donorId on those tables is a nullable, additive link: existing name-based
 * reporting (routes/donors.ts) keeps working unchanged since the UI that writes
 * a donorId also keeps donorName in sync.
 */
export const donors = pgTable("donors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDonorSchema = createInsertSchema(donors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donors.$inferSelect;
