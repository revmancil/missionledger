import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVendors,
  useGetFunds,
  useCreateVendor,
  useCreateBill,
  useCreateExpense,
  getGetVendorsQueryKey,
  getGetBillsQueryKey,
  getGetExpensesQueryKey,
} from "@workspace/api-client-react";
import { useChartOfAccounts } from "@/hooks/use-chart-of-accounts";
import { useInvoiceScan, type ScanResult } from "@/hooks/use-invoice-scan";
import { readAsDataURL, uploadAttachmentData, ACCEPTED_ATTACHMENT_TYPES } from "@/hooks/use-attachments";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ScanLine,
  UploadCloud,
  Loader2,
  Sparkles,
  FileText,
  Building2,
  CheckCircle2,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";

type DocType = "bill" | "expense";

interface FormState {
  description: string;
  amount: string;
  date: string;
  dueDate: string;
  category: string;
  vendorId: string;
  accountId: string;
  cashAccountId: string;
  fundId: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  description: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  dueDate: new Date().toISOString().slice(0, 10),
  category: "",
  vendorId: "",
  accountId: "",
  cashAccountId: "",
  fundId: "",
  notes: "",
};

/**
 * "Upload an invoice and it fills the form" intake flow.
 *
 * Drag in (or pick) a PDF/image, and the server's invoice reader returns the
 * vendor, dates and amounts. Everything lands in an editable form; a Bill/Expense
 * toggle switches which record the scan becomes. The vendor is matched against
 * existing vendors and, on confirm, created if the user leaves "Create vendor"
 * checked. On save the record is created and the original document is attached
 * to it, so the invoice and the entry always travel together.
 */
export function InvoiceIntakeDialog({
  defaultType = "bill",
  onCreated,
  className,
}: {
  defaultType?: DocType;
  onCreated?: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const { scan, scanning } = useInvoiceScan();
  const { data: vendors = [] } = useGetVendors();
  const { data: funds = [] } = useGetFunds();
  const { data: coa = [] } = useChartOfAccounts();
  const createVendor = useCreateVendor();
  const createBill = useCreateBill();
  const createExpense = useCreateExpense();

  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<DocType>(defaultType);
  const [file, setFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createVendorChecked, setCreateVendorChecked] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const expenseAccounts = useMemo(
    () => (coa as any[]).filter((a) => a.type === "EXPENSE" && a.isActive !== false),
    [coa],
  );
  const assetAccounts = useMemo(
    () => (coa as any[]).filter((a) => a.type === "ASSET" && a.isActive !== false),
    [coa],
  );

  const reset = useCallback(() => {
    setFile(null);
    setScanResult(null);
    setForm(EMPTY_FORM);
    setCreateVendorChecked(true);
    setError(null);
    setDragging(false);
  }, []);

  // Seed the form from an extraction result. Dates/amounts are best-effort
  // starting points the user can always override.
  const applyScan = useCallback((result: ScanResult) => {
    const f = result.fields;
    const matchedVendorId = result.vendor?.id ?? "";
    setScanResult(result);
    setCreateVendorChecked(!matchedVendorId);
    setForm({
      description: f.description || "",
      amount: f.amount != null ? String(f.amount) : "",
      date: f.invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate: f.dueDate || f.invoiceDate || new Date().toISOString().slice(0, 10),
      category: f.category || "",
      vendorId: matchedVendorId,
      accountId: "",
      cashAccountId: "",
      fundId: "",
      notes: f.invoiceNumber ? `Invoice ${f.invoiceNumber}` : "",
    });
  }, []);

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setFile(f);
      try {
        const result = await scan(f);
        applyScan(result);
        const parts: string[] = [];
        if (result.fields.vendorName) parts.push(result.fields.vendorName);
        if (result.fields.amount != null) parts.push(`$${result.fields.amount}`);
        if (result.vendorMatched) parts.push("matched an existing vendor");
        toast.success(
          parts.length ? `Read the invoice — ${parts.join(" · ")}` : "Scanned, but found few details",
        );
      } catch (e: any) {
        toast.error(e?.message || "Could not read the invoice");
      }
    },
    [scan, applyScan],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  // Reset when the dialog closes so the next open starts clean.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave = useMemo(() => {
    if (!scanResult || !file) return false;
    if (!form.description.trim() || !form.amount) return false;
    if (!form.accountId) return false;
    if (docType === "bill" && !form.dueDate) return false;
    if (docType === "expense" && (!form.date || !form.category.trim() || !form.cashAccountId)) return false;
    return true;
  }, [scanResult, file, form, docType]);

  async function handleSave() {
    if (!scanResult || !file) return;
    setSaving(true);
    setError(null);
    try {
      // 1) Vendor — use the matched one, or create from the extracted details.
      let vendorId = form.vendorId || null;
      if (!vendorId && createVendorChecked && scanResult.proposedVendor?.name) {
        const created = await createVendor.mutateAsync({
          data: {
            name: scanResult.proposedVendor.name,
            email: scanResult.proposedVendor.email || undefined,
            phone: scanResult.proposedVendor.phone || undefined,
            address: scanResult.proposedVendor.address || undefined,
            taxId: scanResult.proposedVendor.taxId || undefined,
          },
        });
        vendorId = (created as any)?.id ?? null;
        qc.invalidateQueries({ queryKey: getGetVendorsQueryKey() });
      }

      // 2) The bill or expense itself.
      const amountNum = Number(form.amount);
      let entityId: string;
      let entityType: "BILL" | "EXPENSE";
      if (docType === "bill") {
        const created = await createBill.mutateAsync({
          data: {
            vendorId: vendorId || undefined,
            description: form.description.trim(),
            amount: amountNum,
            dueDate: form.dueDate,
            accountId: form.accountId,
            fundId: form.fundId || undefined,
          },
        });
        entityId = (created as any).id;
        entityType = "BILL";
        qc.invalidateQueries({ queryKey: getGetBillsQueryKey() });
      } else {
        const created = await createExpense.mutateAsync({
          data: {
            description: form.description.trim(),
            amount: amountNum,
            date: form.date,
            category: form.category.trim(),
            accountId: form.accountId,
            cashAccountId: form.cashAccountId,
            fundId: form.fundId || undefined,
            vendorId: vendorId || undefined,
            notes: form.notes || undefined,
          },
        });
        entityId = (created as any).id;
        entityType = "EXPENSE";
        qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
      }

      // 3) Attach the source document to the record we just created, keeping the
      //    extracted fields with it so they can be reviewed again later.
      try {
        const dataUrl = await readAsDataURL(file);
        await uploadAttachmentData({
          entityType,
          entityId,
          fileName: file.name,
          fileData: dataUrl,
          extractedJson: scanResult.fields,
        });
      } catch (attachErr: any) {
        // The record exists either way — surface the attach failure but don't
        // pretend the whole operation failed.
        toast.error(attachErr?.message || "Record saved, but attaching the file failed.");
      }

      toast.success(docType === "bill" ? "Bill created from invoice" : "Expense created from receipt");
      onCreated?.();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Could not save. Check the required fields.");
    } finally {
      setSaving(false);
    }
  }

  const matchedVendor = scanResult?.vendor ?? null;
  const hasProposal = !!scanResult?.proposedVendor?.name && !matchedVendor;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("shadow-md shadow-primary/20", className)}>
          <ScanLine className="w-4 h-4 mr-2" />
          Scan invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Create from an invoice
          </DialogTitle>
          <DialogDescription>
            Upload an invoice or receipt and we&apos;ll read the vendor, dates, and amounts for you.
          </DialogDescription>
        </DialogHeader>

        {/* Document type toggle */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm font-medium text-muted-foreground">Create a</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            {(["bill", "expense"] as DocType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDocType(t)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                  docType === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "bill" ? "Bill" : "Expense"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {docType === "bill"
              ? "A payable you owe the vendor — posts to the GL when paid."
              : "An expense paid immediately — posts to the GL right away."}
          </span>
        </div>

        {/* Step 1 — upload */}
        {!scanResult && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !scanning && inputRef.current?.click()}
            className={cn(
              "mt-2 rounded-xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
              scanning && "pointer-events-none opacity-70",
            )}
          >
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
            {scanning ? (
              <div className="flex flex-col items-center gap-3 text-primary">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">Reading the document…</p>
                <p className="text-xs text-muted-foreground">Extracting vendor, dates and amounts</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadCloud className="h-9 w-9 text-muted-foreground/60" />
                <p className="text-sm font-medium">Drop an invoice here, or click to browse</p>
                <p className="text-xs text-muted-foreground">PDF, PNG or JPG · up to 10 MB</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2 — review */}
        {scanResult && (
          <div className="mt-1 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{file?.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">
                  scanned
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
                onClick={reset}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Start over
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. Office supplies"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Amount ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
              {docType === "bill" ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Due date</label>
                  <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date</label>
                  <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
                </div>
              )}
              {docType === "expense" && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Category</label>
                  <Input
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="e.g. Office Supplies"
                  />
                </div>
              )}
            </div>

            {/* Vendor */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Vendor
                {matchedVendor && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> matched
                  </span>
                )}
              </div>
              {matchedVendor ? (
                <p className="text-sm">
                  Using existing vendor <span className="font-medium">{matchedVendor.name}</span>.
                </p>
              ) : hasProposal ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    New vendor detected: <span className="font-medium text-foreground">{scanResult.proposedVendor!.name}</span>
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={createVendorChecked}
                      onChange={(e) => setCreateVendorChecked(e.target.checked)}
                    />
                    Create this vendor automatically
                  </label>
                  {(scanResult.proposedVendor!.email || scanResult.proposedVendor!.taxId) && (
                    <p className="text-xs text-muted-foreground">
                      {[scanResult.proposedVendor!.email, scanResult.proposedVendor!.taxId]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No vendor found on the document.</p>
              )}

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Assign to</label>
                <select
                  value={form.vendorId}
                  onChange={(e) => set("vendorId", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- No vendor --</option>
                  {(vendors as any[]).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Accounts / fund */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Expense account</label>
                <select
                  value={form.accountId}
                  onChange={(e) => set("accountId", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- Select --</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                {scanResult.fields.category && !form.accountId && (
                  <p className="text-xs text-muted-foreground">
                    Extracted category &ldquo;{scanResult.fields.category}&rdquo; — pick the matching account.
                  </p>
                )}
              </div>
              {docType === "expense" ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Paid from</label>
                  <select
                    value={form.cashAccountId}
                    onChange={(e) => set("cashAccountId", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">-- Select --</option>
                    {assetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Fund</label>
                  <select
                    value={form.fundId}
                    onChange={(e) => set("fundId", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">-- No fund --</option>
                    {(funds as any[]).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {docType === "expense" && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={2}
                    placeholder="Optional"
                  />
                </div>
              )}
            </div>

            {docType === "bill" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Fund</label>
                <select
                  value={form.fundId}
                  onChange={(e) => set("fundId", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- No fund --</option>
                  {(funds as any[]).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                The document will be attached to the {docType} automatically.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Create {docType === "bill" ? "bill" : "expense"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
