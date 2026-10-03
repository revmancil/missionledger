import { useCallback, useEffect, useState } from "react";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";

export type AttachmentEntityType =
  | "BILL"
  | "EXPENSE"
  | "DONATION"
  | "TRANSACTION"
  | "JOURNAL_ENTRY";

export interface AttachmentMeta {
  id: string;
  companyId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

/** Max upload size, kept in lockstep with the API's MAX_FILE_BYTES. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_ATTACHMENT_TYPES =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.tiff,.csv,.xls,.xlsx,.doc,.docx,application/pdf,image/*";

function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export { humanSize };

/**
 * Loads and mutates attachments for a single record.
 *
 * Attachments are keyed by (entityType, entityId); the hook is only active once
 * both are known, so it is safe to mount inside a detail view that renders
 * before the record id resolves.
 */
export function useAttachments(entityType: AttachmentEntityType, entityId: string | null | undefined) {
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const enabled = !!entityId;

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await authJsonFetch(
        `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      if (!res.ok) {
        const body = await readJsonSafe<{ error?: string }>(res);
        throw new Error(body?.error || `Could not load attachments (${res.status})`);
      }
      const data = (await readJsonSafe<AttachmentMeta[]>(res)) ?? [];
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Could not load attachments");
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (enabled) void reload();
    else setItems([]);
  }, [enabled, reload]);

  /** Upload a File object. Returns the created attachment, or throws with a message. */
  const upload = useCallback(
    async (file: File): Promise<AttachmentMeta> => {
      if (!entityId) throw new Error("Record is not ready yet");
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`File is too large (${humanSize(file.size)}). Maximum is ${humanSize(MAX_ATTACHMENT_BYTES)}.`);
      }

      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });

      setUploading(true);
      try {
        const res = await authJsonFetch("/api/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId, fileName: file.name, fileData }),
        });
        if (!res.ok) {
          const body = await readJsonSafe<{ error?: string }>(res);
          throw new Error(body?.error || `Upload failed (${res.status})`);
        }
        const created = (await readJsonSafe<AttachmentMeta>(res))!;
        setItems((prev) => [created, ...prev]);
        return created;
      } finally {
        setUploading(false);
      }
    },
    [entityType, entityId],
  );

  const remove = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await authJsonFetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await readJsonSafe<{ error?: string }>(res);
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      setItems((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  return { items, isLoading, error, uploading, deletingId, reload, upload, remove };
}

/**
 * Upload an already-read base64 data URL as an attachment for a record.
 * Standalone so flows that create a record and immediately attach its source
 * document (e.g. invoice intake) can reuse the exact same API contract.
 */
export async function uploadAttachmentData(params: {
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  fileData: string;
  extractedJson?: unknown;
}): Promise<AttachmentMeta> {
  const res = await authJsonFetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await readJsonSafe<{ error?: string }>(res);
    throw new Error(body?.error || `Upload failed (${res.status})`);
  }
  return (await readJsonSafe<AttachmentMeta>(res))!;
}

/**
 * Read a File as a base64 data URL. Shared by the upload flow and the invoice
 * reader so both send the exact same payload shape to the API.
 */
export function readAsDataURL(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Trigger a browser download for an attachment via the authenticated endpoint. */
export async function downloadAttachment(att: Pick<AttachmentMeta, "id" | "fileName">): Promise<void> {
  const res = await authJsonFetch(`/api/attachments/${att.id}/download`);
  if (!res.ok) {
    const body = await readJsonSafe<{ error?: string }>(res);
    throw new Error(body?.error || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.fileName || "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
