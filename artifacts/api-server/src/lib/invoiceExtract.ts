import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Invoice reader / OCR.
 *
 * Given an uploaded invoice or receipt, pull out the fields a bookkeeper would
 * type by hand — vendor identity, invoice number, dates, and amounts — so a bill
 * or expense can be recorded from the document in one step.
 *
 * Two engines, cheapest first:
 *  - PDFs with a text layer are sent to the model as plain text (no image cost).
 *  - Scanned PDFs and image uploads are rendered/downscaled and sent as vision
 *    input. PDF rasterization uses poppler-utils (`pdftoppm`); image
 *    normalization uses ImageMagick (`convert`) when available, and degrades
 *    gracefully to the raw bytes when it is not.
 *
 * The model is reached through the standard OpenAI-compatible endpoint
 * (OPENAI_BASE_URL / OPENAI_API_KEY, e.g. the GenSpark LLM proxy). When those
 * are unset the caller gets a clear, actionable error rather than a crash.
 */

export interface ExtractedInvoice {
  vendorName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  dueDate: string | null; // YYYY-MM-DD
  description: string | null;
  category: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  amount: number | null; // grand total due
}

export interface ExtractResult {
  fields: ExtractedInvoice;
  /** Which path produced the result, for diagnostics. */
  engine: "pdf-text" | "pdf-image" | "image";
  model: string;
  textLength?: number;
}

const SYSTEM_PROMPT = `You are a meticulous accounts-payable clerk. You read a single invoice or receipt and return its key fields as JSON.

Return ONLY a JSON object with exactly these keys (use null when a value is not present — never guess):
{
  "vendorName": string|null,      // the supplier/biller the invoice is FROM (not the customer)
  "vendorEmail": string|null,     // remit-to / billing email, if shown
  "vendorPhone": string|null,
  "vendorAddress": string|null,   // full postal address on one line
  "vendorTaxId": string|null,     // EIN / VAT / tax id, if shown
  "invoiceNumber": string|null,   // invoice/ receipt/ reference number
  "invoiceDate": string|null,     // YYYY-MM-DD
  "dueDate": string|null,         // YYYY-MM-DD (payment due date)
  "description": string|null,     // short, human summary of what was purchased
  "category": string|null,        // a concise expense category (e.g. "Office Supplies")
  "currency": string|null,        // ISO 4217 code, e.g. "USD"
  "subtotal": number|null,        // pre-tax total
  "tax": number|null,             // total tax
  "amount": number|null           // grand total due
}
Rules:
- Numbers are plain numbers, no currency symbols or thousands separators.
- Dates must be ISO YYYY-MM-DD; convert from any format you see.
- Prefer the grand TOTAL for "amount" (not the subtotal).
- If the document is not an invoice/receipt, return all nulls.`;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "n/a" || s.toLowerCase() === "unknown") return null;
  return s;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Coerce the model's output into a well-formed ExtractedInvoice. */
export function normalizeFields(raw: any): ExtractedInvoice {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    vendorName: str(r.vendorName),
    vendorEmail: str(r.vendorEmail),
    vendorPhone: str(r.vendorPhone),
    vendorAddress: str(r.vendorAddress),
    vendorTaxId: str(r.vendorTaxId),
    invoiceNumber: str(r.invoiceNumber),
    invoiceDate: isoDate(r.invoiceDate),
    dueDate: isoDate(r.dueDate),
    description: str(r.description),
    category: str(r.category),
    currency: str(r.currency),
    subtotal: num(r.subtotal),
    tax: num(r.tax),
    amount: num(r.amount),
  };
}

function parseJsonLoose(content: string): any {
  let text = (content ?? "").trim();
  // Models sometimes wrap JSON in a ```json fence or add prose around it.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("The extraction model did not return parseable JSON");
  }
}

type ImagePart = { type: "image_url"; image_url: { url: string } };

function imagePart(buf: Buffer, mime: string): ImagePart {
  return { type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}` } };
}

async function callModel(userParts: Array<Record<string, unknown>>, model: string): Promise<any> {
  const base = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "");
  const key = process.env.OPENAI_API_KEY;
  if (!base || !key) {
    throw new Error(
      "Invoice scanning is not configured on the server (OPENAI_API_KEY / OPENAI_BASE_URL are unset).",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [{ type: "text", text: "Extract the fields from this document." }, ...userParts],
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`Extraction model returned ${res.status}. ${bodyText.slice(0, 200)}`.trim());
    }
    const json: any = await res.json();
    return parseJsonLoose(json?.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timeout);
  }
}

/** Extract the text layer of a PDF (empty string when there is none / it is scanned). */
async function pdfToText(buf: Buffer): Promise<string> {
  // pdf-parse ships no type declarations; routing the specifier through a
  // `string`-typed variable keeps this a dynamic import so TS does not try to
  // resolve the module and emit TS7016.
  const specifier: string = "pdf-parse";
  const mod: any = await import(specifier);
  const fn = mod.default ?? mod;
  const parsed = await fn(buf);
  return String(parsed?.text ?? "").trim();
}

/** Rasterize the first page of a PDF to PNG using poppler-utils. */
async function pdfFirstPagePng(buf: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "inv-scan-"));
  try {
    const inPath = path.join(dir, "in.pdf");
    await writeFile(inPath, buf);
    const prefix = path.join(dir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", "150", "-f", "1", "-l", "1", inPath, prefix]);
    const files = await readdir(dir);
    const png = files.find((f) => f.toLowerCase().endsWith(".png"));
    if (!png) throw new Error("Could not render the PDF's first page");
    return await readFile(path.join(dir, png));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Normalize an image for the model: convert exotic formats and shrink very large
 * files so the vision request stays small. Falls back to the original bytes if
 * ImageMagick is unavailable or the conversion fails.
 */
async function normalizeImage(buf: Buffer, mime: string): Promise<{ buf: Buffer; mime: string }> {
  const common = ["image/png", "image/jpeg", "image/webp"];
  const needsConvert = !common.includes(mime) || buf.length > 3_500_000;
  if (!needsConvert) return { buf, mime };

  const dir = await mkdtemp(path.join(tmpdir(), "inv-img-"));
  try {
    const inPath = path.join(dir, "in");
    const outPath = path.join(dir, "out.jpg");
    await writeFile(inPath, buf);
    await execFileAsync("convert", [`${inPath}[0]`, "-resize", "2000x2000>", "-quality", "85", outPath]);
    return { buf: await readFile(outPath), mime: "image/jpeg" };
  } catch {
    return { buf, mime };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Read an invoice/receipt buffer and return its extracted fields. */
export async function extractInvoiceFields(input: {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}): Promise<ExtractResult> {
  const { buffer, mimeType } = input;
  const model = process.env.INVOICE_OCR_MODEL || "gpt-5-mini";

  if (mimeType === "application/pdf") {
    let text = "";
    try {
      text = await pdfToText(buffer);
    } catch {
      text = "";
    }
    if (text.length >= 40) {
      const raw = await callModel(
        [{ type: "text", text: `Invoice PDF text:\n\n${text.slice(0, 12000)}` }],
        model,
      );
      return { fields: normalizeFields(raw), engine: "pdf-text", model, textLength: text.length };
    }
    const png = await pdfFirstPagePng(buffer);
    const raw = await callModel([imagePart(png, "image/png")], model);
    return { fields: normalizeFields(raw), engine: "pdf-image", model };
  }

  if (mimeType.startsWith("image/")) {
    const norm = await normalizeImage(buffer, mimeType);
    const raw = await callModel([imagePart(norm.buf, norm.mime)], model);
    return { fields: normalizeFields(raw), engine: "image", model };
  }

  throw new Error(`Invoice scanning supports PDF and image files only (received ${mimeType}).`);
}
