import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  Upload,
  FileText,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  useAttachments,
  downloadAttachment,
  humanSize,
  ACCEPTED_ATTACHMENT_TYPES,
  type AttachmentEntityType,
} from "@/hooks/use-attachments";

interface AttachmentPanelProps {
  entityType: AttachmentEntityType;
  entityId: string | null | undefined;
  /** Compact renders a tighter list for inline (expanded-row) contexts. */
  variant?: "default" | "compact";
  title?: string;
  className?: string;
}

/**
 * Reusable invoice/receipt attachment panel.
 *
 * Drop into any record detail view: uploads a file (PDF/image/CSV/Office),
 * lists existing attachments, and downloads or deletes them. Admins can
 * upload/delete; all users can view/download — enforced by the API.
 */
export function AttachmentPanel({
  entityType,
  entityId,
  variant = "default",
  title = "Invoices & documents",
  className,
}: AttachmentPanelProps) {
  const { user } = useAuth();
  const isAdmin = ["ADMIN", "MASTER_ADMIN", "PASTOR"].includes(String((user as any)?.role ?? ""));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { items, isLoading, error, uploading, deletingId, upload, remove } =
    useAttachments(entityType, entityId);

  const compact = variant === "compact";

  async function handleFile(file: File) {
    try {
      const created = await upload(file);
      toast.success(`Attached "${created.fileName}"`);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    }
  }

  async function handleDownload(att: (typeof items)[number]) {
    setDownloadingId(att.id);
    try {
      await downloadAttachment(att);
    } catch (e: any) {
      toast.error(e?.message || "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(att: (typeof items)[number]) {
    if (!confirm(`Remove "${att.fileName}"? This cannot be undone.`)) return;
    try {
      await remove(att.id);
      toast.success("Attachment removed");
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  return (
    <div className={cn("rounded-lg border border-border bg-background", compact ? "p-3" : "p-4", className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn("font-semibold text-foreground truncate", compact ? "text-xs" : "text-sm")}>
            {title}
          </span>
          {items.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {items.length}
            </span>
          )}
        </div>
        {isAdmin && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_ATTACHMENT_TYPES}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs shrink-0"
              disabled={uploading || !entityId}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="h-3.5 w-3.5" /> Attach</>
              )}
            </Button>
          </>
        )}
      </div>

      {!entityId ? (
        <p className="text-xs text-muted-foreground">Save this record first, then attach documents.</p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading attachments…
        </p>
      ) : error ? (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No documents attached yet.
          {isAdmin ? " Use Attach to upload an invoice or receipt (PDF, image, CSV)." : ""}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-foreground truncate">{att.fileName}</div>
                <div className="text-[10px] text-muted-foreground">
                  {humanSize(att.fileSize)}
                  {att.createdAt ? ` · ${formatDate(att.createdAt)}` : ""}
                  {att.uploadedByName ? ` · ${att.uploadedByName}` : ""}
                </div>
              </div>
              <button
                type="button"
                title={`Download ${att.fileName}`}
                onClick={() => void handleDownload(att)}
                disabled={downloadingId === att.id}
                className="p-1 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 disabled:opacity-50 shrink-0"
              >
                {downloadingId === att.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  title="Remove attachment"
                  onClick={() => void handleDelete(att)}
                  disabled={deletingId === att.id}
                  className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-50 shrink-0"
                >
                  {deletingId === att.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
