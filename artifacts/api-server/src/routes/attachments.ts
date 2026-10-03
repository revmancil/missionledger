import { Router } from "express";
import { db, attachments, bills, expenses, donations, transactions, journalEntries, vendors } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { extractInvoiceFields, type ExtractedInvoice } from "../lib/invoiceExtract";

const router = Router();

/**
 * Generic attachments API.
 *
 * Attachments are addressed by (entityType, entityId) so one router serves
 * bills, expenses, donations, bank-register transactions, and journal entries.
 * Every query is company-scoped: we never trust an entityId on its own — the
 * parent record is re-verified inside the caller's company before any write or
 * read, which prevents cross-tenant access via a guessed id.
 *
 * File payloads are transported as base64 data URLs ("data:<mime>;base64,…"),
 * mirroring the existing reconciliation statement flow. Keeping the transport
 * identical means object storage can replace the DB column later without any
 * client changes.
 */

const ENTITY_TYPES = ["BILL", "EXPENSE", "DONATION", "TRANSACTION", "JOURNAL_ENTRY"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

/** Max decoded file size. Postgres TEXT handles this comfortably; 15 MB body limit caps it in app.ts. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** MIME types we accept for invoice/receipt documents. */
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/tiff",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (ENTITY_TYPES as readonly string[]).includes(value);
}

/** Verify the parent record exists and belongs to the caller's company. */
async function parentRecordBelongsToCompany(
  entityType: EntityType,
  entityId: string,
  companyId: string,
): Promise<boolean> {
  switch (entityType) {
    case "BILL": {
      const [row] = await db.select({ id: bills.id }).from(bills)
        .where(and(eq(bills.id, entityId), eq(bills.companyId, companyId))).limit(1);
      return !!row;
    }
    case "EXPENSE": {
      const [row] = await db.select({ id: expenses.id }).from(expenses)
        .where(and(eq(expenses.id, entityId), eq(expenses.companyId, companyId))).limit(1);
      return !!row;
    }
    case "DONATION": {
      const [row] = await db.select({ id: donations.id }).from(donations)
        .where(and(eq(donations.id, entityId), eq(donations.companyId, companyId))).limit(1);
      return !!row;
    }
    case "TRANSACTION": {
      const [row] = await db.select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.id, entityId), eq(transactions.companyId, companyId))).limit(1);
      return !!row;
    }
    case "JOURNAL_ENTRY": {
      const [row] = await db.select({ id: journalEntries.id }).from(journalEntries)
        .where(and(eq(journalEntries.id, entityId), eq(journalEntries.companyId, companyId))).limit(1);
      return !!row;
    }
  }
}

/** Strip the heavy `fileData` column before returning rows to the list endpoint. */
function toMetadata(a: typeof attachments.$inferSelect) {
  let extracted: unknown = null;
  if (a.extractedJson) {
    try {
      extracted = JSON.parse(a.extractedJson);
    } catch {
      extracted = null;
    }
  }
  return {
    id: a.id,
    companyId: a.companyId,
    entityType: a.entityType,
    entityId: a.entityId,
    fileName: a.fileName,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    extractedJson: extracted,
    uploadedBy: a.uploadedBy,
    uploadedByName: a.uploadedByName,
    createdAt: a.createdAt,
  };
}

/** Comparison key for vendor names — case/whitespace/punctuation-insensitive. */
function vendorKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Find a vendor in the caller's company that matches `name`, if one exists.
 * Matching is deliberately conservative (exact normalized name, then normalized
 * "contains") so we don't silently merge two real vendors. Creating a new vendor
 * from the extracted details is left to the client's confirm step (via
 * POST /api/vendors) so a scan the user abandons never leaves an orphan vendor.
 */
async function findVendor(companyId: string, name: string | null | undefined) {
  const clean = (name ?? "").trim();
  if (!clean) return null;

  const existing = await db.select().from(vendors).where(eq(vendors.companyId, companyId));
  const key = vendorKey(clean);
  return (
    existing.find((v) => vendorKey(v.name) === key) ||
    existing.find((v) => {
      const k = vendorKey(v.name);
      return k.length > 2 && (key.includes(k) || k.includes(key));
    }) ||
    null
  );
}

// ── POST /scan — read an invoice/receipt and return its fields + vendor ──────
//
// This is the "upload an invoice and let it fill the form" endpoint. It does
// NOT write a bill/expense; it returns the extracted fields and either an
// existing vendor match or the vendor details needed to create one, so the
// client can show them for confirmation and then create the record through the
// normal bills/expenses endpoints.
router.post("/scan", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { fileData, fileName } = req.body ?? {};

    if (!fileData || typeof fileData !== "string" || !fileData.startsWith("data:")) {
      return void res.status(400).json({ error: "fileData must be a base64 data URL" });
    }
    const comma = fileData.indexOf(",");
    if (comma === -1) return void res.status(400).json({ error: "Malformed fileData" });
    const header = fileData.slice(0, comma);
    if (!header.includes("base64")) {
      return void res.status(400).json({ error: "fileData must be base64-encoded" });
    }
    const mimeMatch = header.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "application/octet-stream";
    if (mimeType !== "application/pdf" && !mimeType.startsWith("image/")) {
      return void res.status(415).json({
        error: "Invoice scanning works with PDF and image files (PNG, JPG, WebP, HEIC).",
      });
    }

    const buffer = Buffer.from(fileData.slice(comma + 1), "base64");
    if (buffer.length === 0) return void res.status(400).json({ error: "File is empty" });
    if (buffer.length > MAX_FILE_BYTES) {
      return void res.status(413).json({
        error: `File is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      });
    }

    let result;
    try {
      result = await extractInvoiceFields({ buffer, mimeType, fileName: String(fileName ?? "") });
    } catch (err: any) {
      console.error("Invoice extraction error:", err);
      return void res.status(422).json({
        error: err?.message || "Could not read this document. Try a clearer photo or a PDF.",
      });
    }

    // Match an existing vendor; hand the caller the extracted details otherwise
    // so it can offer to create one on confirm.
    const vendor = await findVendor(companyId, result.fields.vendorName);
    const proposedVendor = result.fields.vendorName
      ? {
          name: result.fields.vendorName,
          email: result.fields.vendorEmail,
          phone: result.fields.vendorPhone,
          address: result.fields.vendorAddress,
          taxId: result.fields.vendorTaxId,
        }
      : null;

    res.json({
      fields: result.fields,
      vendor,
      vendorMatched: !!vendor,
      proposedVendor,
      engine: result.engine,
      model: result.model,
      textLength: result.textLength ?? null,
    });
  } catch (err) {
    console.error("Invoice scan error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET / — list attachments for a record (metadata only, no file bytes) ─────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const entityType = String(req.query.entityType ?? "");
    const entityId = String(req.query.entityId ?? "");
    if (!isEntityType(entityType) || !entityId) {
      return void res.status(400).json({ error: "entityType and entityId are required" });
    }

    const rows = await db.select().from(attachments)
      .where(and(
        eq(attachments.companyId, companyId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ))
      .orderBy(desc(attachments.createdAt));

    res.json(rows.map(toMetadata));
  } catch (err) {
    console.error("List attachments error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST / — attach a file to a record (base64 data URL) ─────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email, name } = (req as any).user;
    const { entityType, entityId, fileName, fileData, extractedJson } = req.body ?? {};

    if (!isEntityType(entityType)) {
      return void res.status(400).json({ error: "A valid entityType is required" });
    }
    if (!entityId || typeof entityId !== "string") {
      return void res.status(400).json({ error: "entityId is required" });
    }
    if (!fileName || typeof fileName !== "string") {
      return void res.status(400).json({ error: "fileName is required" });
    }
    if (!fileData || typeof fileData !== "string" || !fileData.startsWith("data:")) {
      return void res.status(400).json({ error: "fileData must be a base64 data URL" });
    }

    // Parse the data URL: "data:<mime>;base64,<payload>"
    const comma = fileData.indexOf(",");
    if (comma === -1) {
      return void res.status(400).json({ error: "Malformed fileData" });
    }
    const header = fileData.slice(0, comma);
    const base64 = fileData.slice(comma + 1);
    const mimeMatch = header.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : "application/octet-stream";

    if (!header.includes("base64")) {
      return void res.status(400).json({ error: "fileData must be base64-encoded" });
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return void res.status(415).json({
        error: `Unsupported file type: ${mimeType}. Upload a PDF, image, CSV, or Office document.`,
      });
    }

    // Verify decoded size before we do any work with the buffer.
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) {
      return void res.status(400).json({ error: "File is empty" });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return void res.status(413).json({
        error: `File is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      });
    }

    // Tenant check: the record must exist in the caller's company.
    const ok = await parentRecordBelongsToCompany(entityType, entityId, companyId);
    if (!ok) return void res.status(404).json({ error: "Record not found" });

    // Optional: persist extraction results captured at upload time (e.g. the
    // invoice reader's output) so they can be shown again without re-running OCR.
    let extractedJsonToStore: string | null = null;
    if (extractedJson != null && typeof extractedJson === "object") {
      extractedJsonToStore = JSON.stringify(extractedJson).slice(0, 20000);
    }

    const [created] = await db.insert(attachments).values({
      companyId,
      entityType,
      entityId,
      fileName: fileName.slice(0, 255),
      mimeType,
      fileSize: buffer.length,
      fileData,
      extractedJson: extractedJsonToStore,
      uploadedBy: email ?? null,
      uploadedByName: name ?? null,
    }).returning();

    logAudit({
      req,
      companyId,
      userId: (req as any).user?.id ?? "",
      userEmail: email,
      userName: name,
      action: "CREATE",
      entityType: "ATTACHMENT",
      entityId: created.id,
      description: `Attached "${created.fileName}" to ${entityType} ${entityId}`,
      newValue: { fileName: created.fileName, mimeType, fileSize: buffer.length, entityType, entityId },
    });

    res.status(201).json(toMetadata(created));
  } catch (err) {
    console.error("Upload attachment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id/download — stream the file back as a download ───────────────────
router.get("/:id/download", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [row] = await db.select().from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.companyId, companyId)));
    if (!row) return void res.status(404).json({ error: "Not found" });

    const comma = row.fileData.indexOf(",");
    const base64 = comma === -1 ? row.fileData : row.fileData.slice(comma + 1);
    const buffer = Buffer.from(base64, "base64");

    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${row.fileName.replace(/"/g, "")}"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error("Download attachment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:id — remove an attachment ───────────────────────────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email, name } = (req as any).user;
    const [row] = await db.select().from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.companyId, companyId)));
    if (!row) return void res.status(404).json({ error: "Not found" });

    await db.delete(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.companyId, companyId)));

    logAudit({
      req,
      companyId,
      userId: (req as any).user?.id ?? "",
      userEmail: email,
      userName: name,
      action: "DELETE",
      entityType: "ATTACHMENT",
      entityId: row.id,
      description: `Removed attachment "${row.fileName}" from ${row.entityType} ${row.entityId}`,
      oldValue: { fileName: row.fileName, mimeType: row.mimeType, entityType: row.entityType, entityId: row.entityId },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete attachment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
