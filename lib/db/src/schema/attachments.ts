import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Generic document attachments.
 *
 * One row = one uploaded file attached to one record. Records are addressed
 * generically by (entityType, entityId) so a single table serves bills,
 * expenses, donations, bank-register transactions, and journal entries — and any
 * record type added later — without a per-entity join table.
 *
 * Storage: `fileData` holds a base64 data URL ("data:<mime>;base64,<payload>"),
 * matching the existing reconciliation statement-attachment pattern. This keeps
 * the feature dependency-free on the current Render/Vercel deployment; the API
 * layer isolates reads/writes so object storage (R2/S3) can replace the column
 * later without touching callers.
 *
 * Company scoping is mandatory: every query filters on companyId, so an
 * attachment can never be read across tenants even if an entityId collides.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id").notNull(),
    /** BILL | EXPENSE | DONATION | TRANSACTION | JOURNAL_ENTRY */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    /** Byte length of the decoded payload, for display and quota checks. */
    fileSize: integer("file_size").notNull().default(0),
    /** base64 data URL: "data:<mime>;base64,<payload>" */
    fileData: text("file_data").notNull(),
    /**
     * JSON string of fields extracted from this document by the invoice reader
     * (vendor, dates, amounts, …), or null when it was uploaded without parsing.
     * Kept as text so the extractor can evolve without a schema change.
     */
    extractedJson: text("extracted_json"),
    uploadedBy: text("uploaded_by"),
    uploadedByName: text("uploaded_by_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("attachments_company_entity_idx").on(t.companyId, t.entityType, t.entityId),
  ],
);

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

/** Canonical set of record types that may receive attachments. */
export const ATTACHMENT_ENTITY_TYPES = [
  "BILL",
  "EXPENSE",
  "DONATION",
  "TRANSACTION",
  "JOURNAL_ENTRY",
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];
