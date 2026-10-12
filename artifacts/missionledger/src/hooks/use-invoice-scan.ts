import { useCallback, useState } from "react";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";
import { readAsDataURL } from "@/hooks/use-attachments";

/** Fields the invoice reader pulls off a document. Mirrors the API's ExtractedInvoice. */
export interface ScannedFields {
  vendorName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  description: string | null;
  category: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  amount: number | null;
}

export interface VendorLite {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
}

export interface ProposedVendor {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
}

export interface ScanResult {
  fields: ScannedFields;
  /** An existing vendor that matches the extracted name, if any. */
  vendor: VendorLite | null;
  vendorMatched: boolean;
  /** Details to create a vendor with, when no match was found. */
  proposedVendor: ProposedVendor | null;
  engine: "pdf-text" | "pdf-image" | "image" | string;
  model: string;
  textLength: number | null;
}

/**
 * Sends a document to the server's invoice reader and returns the extracted
 * fields plus vendor matching information. Read-only — nothing is persisted
 * until the caller confirms and creates the record.
 */
export function useInvoiceScan() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (file: File): Promise<ScanResult> => {
    setScanning(true);
    setError(null);
    try {
      const fileData = await readAsDataURL(file);
      const res = await authJsonFetch("/api/attachments/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileData }),
      });
      if (!res.ok) {
        const body = await readJsonSafe<{ error?: string }>(res);
        throw new Error(body?.error || `Could not read the document (${res.status})`);
      }
      const data = (await readJsonSafe<ScanResult>(res))!;
      return data;
    } catch (e: any) {
      const msg = e?.message || "Could not read the document";
      setError(msg);
      throw e;
    } finally {
      setScanning(false);
    }
  }, []);

  return { scan, scanning, error, setError };
}
