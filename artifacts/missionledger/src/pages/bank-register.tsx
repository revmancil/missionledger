import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Plus, ChevronDown, ChevronUp, CheckCircle, Circle,
  RefreshCw, Edit, Wallet, Scissors, Trash2, Search,
  AlertCircle, CheckCheck, Lock, FileText, Upload,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useFinancialSync } from "@/lib/financial-sync";
import { authJsonFetch, logApiFailure, readJsonSafe } from "@/lib/auth-fetch";
import { apiUrl } from "@/lib/api-base";

/** Path must start with `/api/…` (or full http URL). Uses VITE_API_BASE_URL when the API is on another host. */
function apiFetch(path: string, init?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("ml_token") : null;
  const url = path.startsWith("http") ? path : apiUrl(path.startsWith("/") ? path : `/${path}`);
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function summarizeErrorBody(body: unknown, status: number): string {
  const o = body as Record<string, unknown> | null | undefined;
  const detail =
    (typeof o?.detail === "string" && o.detail.trim()) ||
    (typeof o?.message === "string" && o.message.trim()) ||
    (typeof o?.error === "string" && o.error.trim()) ||
    "";
  return detail ? `${detail} (${status})` : `HTTP ${status}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BankAccount { id: string; name: string; accountNumber: string; currentBalance: number; isPlaidLinked?: boolean; plaidInstitutionName?: string; }
interface ChartAccount { id: string; code: string; name: string; type: string; }
interface Fund { id: string; name: string; fundType?: string; }
const FUND_TYPE_SHORT: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Restricted (Temp)",
  RESTRICTED_PERM: "Restricted (Perm)",
  BOARD_DESIGNATED: "Board Designated",
};
function fundLabel(f: Fund) {
  return f.fundType ? `${f.name} — ${FUND_TYPE_SHORT[f.fundType] ?? f.fundType}` : f.name;
}
interface Vendor { id: string; name: string; email?: string; phone?: string; }
const FUNCTIONAL_TYPES = [
  { value: "PROGRAM_SERVICE",    label: "Program Service" },
  { value: "MANAGEMENT_GENERAL", label: "Management & General" },
  { value: "FUNDRAISING",        label: "Fundraising" },
];

interface SplitLine {
  id: string; // local key only
  chartAccountId: string;
  vendorId: string;
  amount: string; // raw string for input
  memo: string;
  functionalType: string;
}
function txBankId(t: { bankAccount?: BankAccount | null; bankAccountId?: string | null }): string | undefined {
  return t.bankAccount?.id ?? t.bankAccountId ?? undefined;
}

interface Transaction {
  id: string; date: string; payee: string; amount: number;
  type: "DEBIT" | "CREDIT";
  status: "UNCLEARED" | "CLEARED" | "RECONCILED" | "VOID";
  checkNumber: string | null; referenceNumber: string | null; memo: string | null;
  isVoid: boolean; isSplit: boolean; isClosed?: boolean;
  journalEntryId: string | null;
  plaidTransactionId?: string | null;
  bankAccountId?: string | null;
  chartAccount: ChartAccount | null;
  fund: Fund | null; bankAccount: BankAccount | null; vendor: Vendor | null;
  splits: Array<{ id: string; chartAccountId: string | null; vendorId: string | null; amount: number; memo: string | null; chartAccount: ChartAccount | null; vendor: Vendor | null; }>;
  runningBalance?: number;
}
type StatusFilter = "ALL" | "UNCLEARED" | "CLEARED" | "RECONCILED" | "VOID";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function newSplitLine(): SplitLine {
  return { id: crypto.randomUUID(), chartAccountId: "", vendorId: "", amount: "", memo: "", functionalType: "" };
}

const emptyForm = {
  date: format(new Date(), "yyyy-MM-dd"),
  payee: "", vendorId: "", amount: "",
  type: "DEBIT" as "DEBIT" | "CREDIT",
  status: "UNCLEARED" as "UNCLEARED" | "CLEARED",
  chartAccountId: "", fundId: "", bankAccountId: "",
  memo: "", checkNumber: "", referenceNumber: "",
  donorName: "",
  isSplit: false,
  functionalType: "",
  splits: [newSplitLine()],
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CLEARED:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    RECONCILED: "bg-blue-50 text-blue-700 border-blue-200",
    UNCLEARED:  "bg-amber-50 text-amber-700 border-amber-200",
    VOID:       "bg-red-50 text-red-600 border-red-200",
  };
  const labels: Record<string, string> = { CLEARED: "Cleared", RECONCILED: "Reconciled", UNCLEARED: "Uncleared", VOID: "Void" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", map[status] ?? map.UNCLEARED)}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Vendor Combobox ───────────────────────────────────────────────────────────
function VendorCombobox({
  value, onChange, vendors, onAddNew, placeholder = "Payee / Vendor\u2026",
}: {
  value: string; onChange: (id: string, name: string) => void;
  vendors: Vendor[]; onAddNew: () => void; placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = vendors.find((v) => v.id === value);
  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 12);

  useEffect(() => {
    if (selected && !query) setQuery(selected.name);
  }, [selected]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange("", "");
          }}
        />
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && query && (
            <div className="px-3 py-2 text-sm text-muted-foreground italic">No vendors match</div>
          )}
          {filtered.map((v) => (
            <button
              key={v.id}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-[hsl(210,60%,97%)] transition-colors",
                v.id === value && "bg-[hsl(210,60%,95%)] font-medium"
              )}
              onMouseDown={(e) => { e.preventDefault(); onChange(v.id, v.name); setQuery(v.name); setOpen(false); }}
            >
              {v.name}
              {v.email && <span className="ml-2 text-xs text-muted-foreground">{v.email}</span>}
            </button>
          ))}
          <button
            className="w-full text-left px-3 py-2 text-sm text-[hsl(174,60%,40%)] hover:bg-emerald-50 border-t flex items-center gap-2 font-medium"
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddNew(); }}
          >
            <Plus className="h-3.5 w-3.5" /> Add New Vendor
          </button>
        </div>
      )}
    </div>
  );
}

// ── COA Combobox (searchable, scrollable, grouped) ────────────────────────────
const COA_TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const COA_TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Equity",
  INCOME: "Income", EXPENSE: "Expenses",
};

function CoaSelect({
  value, onChange, coaList, onAddNew,
}: {
  value: string; onChange: (id: string) => void; coaList: ChartAccount[]; onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = coaList.find((a) => a.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return coaList;
    return coaList.filter(
      (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [coaList, query]);

  // Group by type, preserving order
  const grouped = useMemo(() => {
    const map = new Map<string, ChartAccount[]>();
    for (const type of COA_TYPE_ORDER) map.set(type, []);
    for (const acct of filtered) {
      const bucket = map.get(acct.type) ?? [];
      bucket.push(acct);
      map.set(acct.type, bucket);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm bg-white text-left transition-colors",
          open ? "border-ring ring-2 ring-ring/20" : "border-input hover:border-muted-foreground/40"
        )}
      >
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected
            ? <><span className="font-mono text-xs text-muted-foreground mr-1">{selected.code}</span>{selected.name}</>
            : "Account / Category…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[200] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-xl flex flex-col"
          style={{ maxHeight: "min(320px, 60vh)" }}>
          {/* Search */}
          <div className="p-2 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                placeholder="Search by code or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1">
            {/* Clear selection */}
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 italic"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(""); }}
            >
              — None —
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground text-center italic">No accounts match "{query}"</p>
            ) : (
              COA_TYPE_ORDER.map((type) => {
                const items = grouped.get(type) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 sticky top-0">
                      {COA_TYPE_LABELS[type]}
                    </div>
                    {items.map((acct) => (
                      <button
                        key={acct.id}
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-[hsl(210,60%,97%)] transition-colors flex items-center gap-2",
                          acct.id === value && "bg-[hsl(210,60%,95%)] font-medium"
                        )}
                        onMouseDown={(e) => { e.preventDefault(); handleSelect(acct.id); }}
                      >
                        <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{acct.code}</span>
                        <span className="flex-1 truncate">{acct.name}</span>
                        {acct.id === value && <CheckCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Add new */}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-[hsl(174,60%,40%)] hover:bg-emerald-50 border-t border-gray-100 flex items-center gap-2 font-medium shrink-0"
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddNew(); }}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" /> Add New Account
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add New Vendor Modal ───────────────────────────────────────────────────────
function AddVendorModal({
  open, onClose, onCreated,
}: {
  open: boolean; onClose: () => void; onCreated: (v: Vendor) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", taxId: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!form.name.trim()) { setErr("Vendor name is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await apiFetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); setErr(e.error ?? "Error saving vendor"); return; }
      const created = await res.json();
      onCreated(created);
      setForm({ name: "", email: "", phone: "", taxId: "" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div>
            <Label className="text-xs">Vendor Name *</Label>
            <Input placeholder="e.g. Office Depot" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input placeholder="Optional" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input placeholder="Optional" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tax ID / EIN</Label>
            <Input placeholder="Optional" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave} disabled={saving}
            className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
          >
            {saving ? "Saving…" : "Add Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add New Account Modal ──────────────────────────────────────────────────────
function AddAccountModal({
  open, onClose, onCreated,
}: {
  open: boolean; onClose: () => void; onCreated: (a: ChartAccount) => void;
}) {
  const [form, setForm] = useState({ code: "", name: "", type: "EXPENSE" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) { setErr("Code and name are required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await apiFetch("/api/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); setErr(e.error ?? "Error saving account"); return; }
      const created = await res.json();
      onCreated(created);
      setForm({ code: "", name: "", type: "EXPENSE" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add New Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Account Number *</Label>
              <Input placeholder="e.g. 4150 or 8250" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <p className="text-[10px] text-muted-foreground mt-0.5">4000s = Income · 8000s = Expense</p>
            </div>
            <div>
              <Label className="text-xs">Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Income</SelectItem>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                  <SelectItem value="ASSET">Asset</SelectItem>
                  <SelectItem value="LIABILITY">Liability</SelectItem>
                  <SelectItem value="EQUITY">Equity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Account Name *</Label>
            <Input placeholder="e.g. Sound Equipment" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave} disabled={saving}
            className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
          >
            {saving ? "Saving…" : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BankRegisterPage() {
  const { refetch: globalRefetch } = useFinancialSync();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [coaList, setCoaList] = useState<ChartAccount[]>([]);
  const [fundList, setFundList] = useState<Fund[]>([]);
  const [vendorList, setVendorList] = useState<Vendor[]>([]);
  const [txList, setTxList] = useState<Transaction[]>([]);
  const [closedUntil, setClosedUntil] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importBankId, setImportBankId] = useState("");
  const [importKind, setImportKind] = useState<"csv" | "pdf">("csv");
  const [importingCsv, setImportingCsv] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [formError, setFormError] = useState("");
  const [jeModal, setJeModal] = useState<{ open: boolean; data: any | null; loading: boolean }>({
    open: false, data: null, loading: false,
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [banksR, coaR, fundsR, vendorsR, txR] = await Promise.all([
        apiFetch("/api/bank-accounts"),
        apiFetch("/api/chart-of-accounts"),
        apiFetch("/api/funds"),
        apiFetch("/api/vendors"),
        apiFetch("/api/transactions"),
      ]);

      const loadFailures: string[] = [];

      if (banksR.ok) setBankAccounts(await banksR.json());
      else {
        const body = await readJsonSafe(banksR);
        logApiFailure("/api/bank-accounts", banksR, body);
        loadFailures.push(`Bank accounts: ${summarizeErrorBody(body, banksR.status)}`);
      }
      if (coaR.ok) setCoaList(await coaR.json());
      else {
        const body = await readJsonSafe(coaR);
        logApiFailure("/api/chart-of-accounts", coaR, body);
        loadFailures.push(`Chart of accounts: ${summarizeErrorBody(body, coaR.status)}`);
      }
      if (fundsR.ok) {
        const d = await fundsR.json();
        setFundList(Array.isArray(d) ? d : (d.data ?? []));
      } else {
        const body = await readJsonSafe(fundsR);
        logApiFailure("/api/funds", fundsR, body);
        loadFailures.push(`Funds: ${summarizeErrorBody(body, fundsR.status)}`);
      }
      if (vendorsR.ok) setVendorList(await vendorsR.json());
      else {
        const body = await readJsonSafe(vendorsR);
        logApiFailure("/api/vendors", vendorsR, body);
        loadFailures.push(`Vendors: ${summarizeErrorBody(body, vendorsR.status)}`);
      }

      if (txR.ok) {
        const txData = await txR.json();
        if (Array.isArray(txData)) {
          setTxList(txData);
        } else {
          setTxList(txData.transactions ?? []);
          setClosedUntil(txData.closedUntil ?? null);
        }
      } else {
        const errBody = await readJsonSafe(txR);
        logApiFailure("/api/transactions", txR, errBody);
        const o = errBody as Record<string, unknown> | null;
        const fromApi =
          (typeof o?.message === "string" && o.message.trim()) ||
          (typeof o?.error === "string" && o.error.trim()) ||
          "";
        loadFailures.push(`Transactions: ${summarizeErrorBody(errBody, txR.status)}`);
        if (txR.status === 402 || o?.error === "SUBSCRIPTION_REQUIRED") {
          toast.error(fromApi || "Subscription required", {
            description: "Open Billing to renew or start a subscription.",
          });
        } else if (txR.status === 401) {
          toast.error(fromApi || "Session expired. Sign in again.");
        } else if (txR.status === 403) {
          toast.error(fromApi || "You don’t have access to load transactions.");
        } else {
          const dbg =
            typeof o?.detail === "string" && String(o.detail).trim()
              ? String(o.detail).trim()
              : undefined;
          toast.error(
            fromApi || `Could not load transactions (${txR.status}). Try Refresh or check your connection.`,
            dbg ? { description: dbg } : undefined,
          );
        }
      }

      const hasNonTxFailure = loadFailures.some((f) => !f.startsWith("Transactions:"));
      if (loadFailures.length > 0 && (hasNonTxFailure || loadFailures.length > 1)) {
        const summary = loadFailures.slice(0, 2).join(" · ");
        const extra = loadFailures.length > 2 ? ` (+${loadFailures.length - 2} more)` : "";
        toast.message("Some data failed to load", { description: `${summary}${extra}` });
      }
    } catch (e) {
      console.error("Bank register loadAll:", e);
      toast.error("Network error loading the bank register. Check VPN, CORS, and that the API URL is set.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const filtered = txList.filter((t) => {
    if (selectedBank !== "ALL" && txBankId(t) !== selectedBank) return false;
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    return true;
  });

  // Compute running balance oldest→newest (API returns newest-first, so reverse)
  const balanceMap = new Map<string, number>();
  let rb = 0;
  for (const t of [...filtered].reverse()) {
    if (!t.isVoid) rb += t.type === "CREDIT" ? t.amount : -t.amount;
    balanceMap.set(t.id, rb);
  }
  const withBalance = filtered.map((t) => ({ ...t, runningBalance: balanceMap.get(t.id) ?? 0 }));

  const totals = filtered.reduce(
    (acc, t) => {
      if (!t.isVoid) {
        if (t.type === "DEBIT") acc.debits += t.amount;
        else acc.credits += t.amount;
      }
      return acc;
    },
    { debits: 0, credits: 0 }
  );

  const selectedBankObj = bankAccounts.find((b) => b.id === selectedBank);

  // ── Split validation ────────────────────────────────────────────────────────
  const splitSum = useMemo(() => {
    if (!form.isSplit) return 0;
    return form.splits.reduce((s, row) => s + (parseFloat(row.amount) || 0), 0);
  }, [form.isSplit, form.splits]);

  const bankTotal = parseFloat(form.amount) || 0;
  const splitDiff = Math.abs(splitSum - bankTotal);
  const splitValid = !form.isSplit || splitDiff < 0.005;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
  }

  function openAdd() {
    setEditTx(null);
    setFormError("");
    setForm({
      ...emptyForm,
      bankAccountId: selectedBank !== "ALL" ? selectedBank : (bankAccounts[0]?.id ?? ""),
      splits: [newSplitLine()],
    });
    setShowForm(true);
  }

  async function openJeModal(journalEntryId: string) {
    setJeModal({ open: true, data: null, loading: true });
    try {
      const res = await apiFetch(`/api/journal-entries/${journalEntryId}`);
      if (!res.ok) throw new Error("Failed to load journal entry");
      const data = await res.json();
      setJeModal({ open: true, data, loading: false });
    } catch {
      setJeModal({ open: false, data: null, loading: false });
      toast.error("Could not load journal entry details.");
    }
  }

  async function openSplitsModal(txId: string, txJeId: string | null) {
    setJeModal({ open: true, data: null, loading: true });
    try {
      const res = await apiFetch(`/api/transactions/${txId}/splits`);
      if (!res.ok) throw new Error("Failed to load entry");
      const body = await res.json();
      // Shape it to match the JE modal's expectations
      setJeModal({
        open: true,
        loading: false,
        data: {
          entryNumber: txJeId ? undefined : undefined,
          description: "Journal Entry Details",
          date: new Date().toISOString(),
          status: "POSTED",
          memo: null,
          lines: (body.splits ?? []).map((s: any) => ({
            account: s.account,
            fund: s.fund,
            debit: s.debit ?? 0,
            credit: s.credit ?? 0,
            description: s.memo,
          })),
          _txId: txId,
          _source: body.source,
        },
      });
    } catch {
      setJeModal({ open: false, data: null, loading: false });
      toast.error("Could not load entry details.");
    }
  }

  function openEdit(tx: Transaction) {
    setEditTx(tx);
    setFormError("");
    setForm({
      date: format(parseISO(tx.date), "yyyy-MM-dd"),
      payee: tx.payee,
      vendorId: tx.vendor?.id ?? "",
      amount: String(tx.amount),
      type: tx.type,
      status: tx.status === "CLEARED" ? "CLEARED" : "UNCLEARED",
      chartAccountId: tx.chartAccount?.id ?? "",
      fundId: tx.fund?.id ?? "",
      bankAccountId: txBankId(tx) ?? "",
      memo: tx.memo ?? "",
      checkNumber: tx.checkNumber ?? "",
      referenceNumber: tx.referenceNumber ?? "",
      donorName: (tx as any).donorName ?? "",
      isSplit: tx.isSplit,
      functionalType: (tx as any).functionalType ?? "",
      splits: tx.isSplit && tx.splits.length > 0
        ? tx.splits.map((s) => ({
            id: s.id,
            chartAccountId: s.chartAccountId ?? "",
            vendorId: s.vendorId ?? "",
            amount: String(s.amount),
            memo: s.memo ?? "",
            functionalType: (s as any).functionalType ?? "",
          }))
        : [newSplitLine()],
    });
    setShowForm(true);
  }

  function updateSplit(idx: number, field: keyof SplitLine, val: string) {
    const next = [...form.splits];
    next[idx] = { ...next[idx], [field]: val };
    setForm((f) => ({ ...f, splits: next }));
  }

  function addSplitRow() {
    setForm((f) => ({ ...f, splits: [...f.splits, newSplitLine()] }));
  }

  function removeSplitRow(idx: number) {
    setForm((f) => ({ ...f, splits: f.splits.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!splitValid) {
      setFormError(`Split total (${fmtAmt(splitSum)}) must equal bank total (${fmtAmt(bankTotal)})`);
      return;
    }
    setSaving(true); setFormError("");
    try {
      const body: any = {
        date: form.date, payee: form.payee,
        vendorId: form.vendorId || null,
        amount: parseFloat(form.amount) || 0,
        type: form.type, status: form.status,
        chartAccountId: form.isSplit ? null : (form.chartAccountId || null),
        fundId: form.fundId || null,
        bankAccountId: form.bankAccountId || null,
        checkNumber: form.checkNumber || null,
        referenceNumber: form.referenceNumber || null,
        memo: form.memo || null,
        isSplit: form.isSplit,
        donorName: form.donorName || null,
        functionalType: form.isSplit ? null : (form.functionalType || null),
        splits: form.isSplit
          ? form.splits.map((s, i) => ({
              chartAccountId: s.chartAccountId || null,
              vendorId: s.vendorId || null,
              amount: parseFloat(s.amount) || 0,
              memo: s.memo || null,
              functionalType: s.functionalType || null,
              sortOrder: i,
            }))
          : [],
      };

      const url = editTx ? `/api/transactions/${editTx.id}` : "/api/transactions";
      const res = await apiFetch(url, {
        method: editTx ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json();
        if (e.code === "DUPLICATE_TRANSACTION") {
          setFormError(e.error ?? "Duplicate Detected: This transaction is already in the Register.");
        } else {
          setFormError(e.error ?? "Error saving transaction");
        }
        return;
      }
      setShowForm(false);
      await loadAll();
      globalRefetch();
    } finally { setSaving(false); }
  }

  async function handleVoid(tx: Transaction) {
    await apiFetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await loadAll();
    globalRefetch();
  }

  async function toggleStatus(tx: Transaction) {
    const next = tx.status === "CLEARED" ? "UNCLEARED" : "CLEARED";
    await apiFetch(`/api/transactions/${tx.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
    globalRefetch();
  }

  async function handlePlaidSync(bankAccountId: string) {
    setSyncing(true);
    try {
      const res = await authJsonFetch(`/api/plaid/sync/${bankAccountId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const msg =
        json.imported > 0
          ? `Imported ${json.imported} new transaction${json.imported !== 1 ? "s" : ""}${json.skipped > 0 ? ` (${json.skipped} already existed)` : ""}`
          : (json.total ?? 0) === 0
            ? "Plaid returned no transactions for this date range yet (sandbox feeds can take a few minutes)."
            : `All ${json.total} transaction${json.total !== 1 ? "s" : ""} already in the register`;
      toast.success(msg);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync transactions");
    } finally {
      setSyncing(false);
    }
  }

  async function handleImportStatement() {
    if (!importBankId) {
      toast.error("Select the bank account these transactions belong to.");
      return;
    }
    const token = localStorage.getItem("ml_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    setImportingCsv(true);
    try {
      if (importKind === "csv") {
        const file = csvFileRef.current?.files?.[0];
        if (!file) {
          toast.error("Choose a CSV file exported from your bank.");
          return;
        }
        const csvText = await file.text();
        const res = await fetch(apiUrl("/api/transactions/import-statement"), {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ bankAccountId: importBankId, csvText }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Import failed");
        const parts = [`Imported ${json.imported} transaction(s).`];
        if (json.skippedDuplicates) parts.push(`Skipped ${json.skippedDuplicates} duplicate(s).`);
        if (json.skippedLockedPeriod) parts.push(`${json.skippedLockedPeriod} in locked period.`);
        toast.success(parts.join(" "));
        if (json.parseErrors?.length) {
          toast.message("Row warnings", {
            description: json.parseErrors.slice(0, 6).join(" · "),
          });
        }
        if (csvFileRef.current) csvFileRef.current.value = "";
      } else {
        const file = pdfFileRef.current?.files?.[0];
        if (!file) {
          toast.error("Choose a PDF statement from your bank (text-based PDF, not a photo scan).");
          return;
        }
        if (file.type && file.type !== "application/pdf") {
          toast.error("Please select a PDF file.");
          return;
        }
        const buf = await file.arrayBuffer();
        let pdfBase64 = "";
        const bytes = new Uint8Array(buf);
        let binary = "";
        const step = 8192;
        for (let i = 0; i < bytes.length; i += step) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step) as unknown as number[]);
        }
        pdfBase64 = btoa(binary);
        const res = await fetch(apiUrl("/api/transactions/import-statement-pdf"), {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ bankAccountId: importBankId, pdfBase64 }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "PDF import failed");
        const parts = [`Imported ${json.imported} transaction(s) from PDF.`];
        if (json.skippedDuplicates) parts.push(`Skipped ${json.skippedDuplicates} duplicate(s).`);
        if (json.skippedLockedPeriod) parts.push(`${json.skippedLockedPeriod} in locked period.`);
        toast.success(parts.join(" "));
        if (json.parseErrors?.length) {
          toast.message("Parse notes", {
            description: json.parseErrors.slice(0, 6).join(" · "),
          });
        }
        if (pdfFileRef.current) pdfFileRef.current.value = "";
      }
      setImportCsvOpen(false);
      setImportKind("csv");
      await loadAll();
      globalRefetch();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImportingCsv(false);
    }
  }

  function openImportCsv() {
    if (bankAccounts.length === 0) {
      toast.error("Add a bank account first.");
      return;
    }
    setImportBankId(selectedBank !== "ALL" ? selectedBank : bankAccounts[0]!.id);
    setImportKind("csv");
    setImportCsvOpen(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col -m-4 md:-m-8 min-h-[calc(100vh-8rem)]">

        {/* ── Toolbar ─────────────────────────────────── */}
        <div className="border-b bg-white px-4 md:px-6 py-4">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-[hsl(210,60%,25%)]">Bank Register</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                Double-row register with split transactions and vendor tracking
              </p>
            </div>
            <Button onClick={openAdd} className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white gap-2 shrink-0">
              <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Transaction</span><span className="sm:hidden">Add</span>
            </Button>
          </div>

          {closedUntil && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">
                Period locked through {format(parseISO(closedUntil), "MMMM d, yyyy")} — transactions in this period are read-only.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <div className="flex items-center gap-2 shrink-0">
              <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger className="w-44 sm:w-52 h-8 text-sm"><SelectValue placeholder="All Accounts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Bank Accounts</SelectItem>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}{b.accountNumber ? ` (\u2026${b.accountNumber.slice(-4)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {(["ALL","UNCLEARED","CLEARED","RECONCILED","VOID"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap shrink-0",
                    statusFilter === s
                      ? "bg-[hsl(210,60%,25%)] text-white border-[hsl(210,60%,25%)]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  )}
                >
                  {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-slate-200 hover:bg-slate-50"
                onClick={openImportCsv}
                disabled={loading}
                title="Upload a bank CSV export"
              >
                <Upload className="h-3 w-3 mr-1" />
                Import
              </Button>
              {selectedBank !== "ALL" && selectedBankObj?.isPlaidLinked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => handlePlaidSync(selectedBank)}
                  disabled={syncing || loading}
                >
                  <RefreshCw className={cn("h-3 w-3 mr-1", syncing && "animate-spin")} />
                  {syncing ? "Syncing…" : `Sync ${selectedBankObj.plaidInstitutionName || "Bank"}`}
                </Button>
              )}
              <button onClick={loadAll} disabled={loading}
                className="text-muted-foreground hover:text-foreground p-1 rounded" title="Refresh">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {selectedBankObj && (
            <div className="mt-3 flex gap-6 text-sm">
              <span className="text-muted-foreground">Balance:&nbsp;<span className="font-semibold">{fmtAmt(
                txList
                  .filter(t => !t.isVoid && txBankId(t) === selectedBankObj.id)
                  .reduce((s, t) => s + (t.type === "CREDIT" ? t.amount : -t.amount), 0)
              )}</span></span>
              <span className="text-muted-foreground">Payments:&nbsp;<span className="font-semibold text-red-600">{fmtAmt(totals.debits)}</span></span>
              <span className="text-muted-foreground">Deposits:&nbsp;<span className="font-semibold text-emerald-600">{fmtAmt(totals.credits)}</span></span>
            </div>
          )}
        </div>

        {/* ── Register Table ───────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-[hsl(210,40%,96%)] border-b">
              <tr>
                <th className="text-left px-3 md:px-4 py-2 font-semibold text-xs text-muted-foreground w-24 md:w-28">DATE</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-24 hidden md:table-cell">CHECK #</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground">PAYEE / ACCOUNT</th>
                <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-24 md:w-32">PAYMENT</th>
                <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-24 md:w-32 hidden sm:table-cell">DEPOSIT</th>
                <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-28 hidden lg:table-cell">BALANCE</th>
                <th className="text-center px-2 py-2 font-semibold text-xs text-muted-foreground w-24 md:w-28 hidden sm:table-cell">STATUS</th>
                <th className="px-2 py-2 w-20 md:w-24"></th>
              </tr>
            </thead>
            <tbody>
              {withBalance.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-muted-foreground">
                    {loading
                      ? "Loading\u2026"
                      : txList.length > 0 && selectedBank !== "ALL"
                        ? "No transactions for this bank account. Choose \u201cAll Bank Accounts\u201d or pick the account you imported into."
                        : "No transactions yet. Click \u201cAdd Transaction\u201d to get started."}
                  </td>
                </tr>
              )}

              {withBalance.map((tx, idx) => {
                const expanded = expandedRows.has(tx.id);
                const isVoid = tx.isVoid;
                const isDebit = tx.type === "DEBIT";
                const stripe = idx % 2 === 0 ? "bg-white" : "bg-[hsl(210,40%,99%)]";

                return (
                  <React.Fragment key={tx.id}>
                    {/* ROW 1 */}
                    <tr
                      className={cn(
                        "group border-b border-gray-100 cursor-pointer transition-colors",
                        stripe,
                        isVoid && "opacity-40 line-through",
                        !isVoid && "hover:bg-[hsl(210,60%,97%)]"
                      )}
                      onClick={() => toggleRow(tx.id)}
                    >
                      <td className="px-3 md:px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                        {format(parseISO(tx.date), "MM/dd/yy")}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                        {tx.checkNumber ?? "\u2014"}
                      </td>
                      <td className="px-2 py-2.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {tx.journalEntryId ? (
                            <button
                              className="font-semibold text-[hsl(210,60%,40%)] underline underline-offset-2 hover:text-[hsl(210,60%,25%)] text-left transition-colors"
                              title="Click to view journal entry details"
                              onClick={(e) => { e.stopPropagation(); openSplitsModal(tx.id, tx.journalEntryId ?? null); }}
                            >
                              {tx.payee}
                            </button>
                          ) : (
                            <span className="font-semibold text-[hsl(210,60%,25%)]">{tx.payee}</span>
                          )}
                          {tx.isSplit && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700">
                              <Scissors className="h-3 w-3" /> Split
                            </span>
                          )}
                        </div>
                        {tx.vendor && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{tx.vendor.name}</div>
                        )}
                        {/* Mobile-only: show status badge inline under payee */}
                        <div className="sm:hidden mt-1"><StatusBadge status={tx.status} /></div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {isDebit && !isVoid
                          ? <span className="text-red-600 font-medium text-xs md:text-sm">{fmtAmt(tx.amount)}</span>
                          : <span className="text-muted-foreground/30 text-xs">{"—"}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums hidden sm:table-cell">
                        {!isDebit && !isVoid
                          ? <span className="text-emerald-600 font-medium">{fmtAmt(tx.amount)}</span>
                          : <span className="text-muted-foreground/30">{"—"}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-foreground font-medium hidden lg:table-cell">
                        {!isVoid ? fmtAmt(tx.runningBalance ?? 0) : "\u2014"}
                      </td>
                      <td className="px-2 py-2.5 text-center hidden sm:table-cell"><StatusBadge status={tx.status} /></td>
                      <td className="px-1 md:px-2 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {tx.journalEntryId && (
                            <button
                              title="View Journal Entry Details"
                              onClick={(e) => { e.stopPropagation(); openJeModal(tx.journalEntryId!); }}
                              className="p-1 rounded hover:bg-indigo-50 text-muted-foreground hover:text-indigo-600"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          )}
                          {tx.isClosed ? (
                            <span title={`Period locked through ${closedUntil ? format(parseISO(closedUntil), "MM/dd/yyyy") : ""}`}
                              className="p-1 text-amber-500">
                              <Lock className="h-4 w-4" />
                            </span>
                          ) : !isVoid && (
                            <>
                              <button title={tx.status === "CLEARED" ? "Mark Uncleared" : "Mark Cleared"}
                                onClick={(e) => { e.stopPropagation(); toggleStatus(tx); }}
                                className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-emerald-600">
                                {tx.status === "CLEARED"
                                  ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                                  : <Circle className="h-4 w-4" />}
                              </button>
                              <button title="Edit"
                                onClick={(e) => { e.stopPropagation(); openEdit(tx); }}
                                className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-blue-600">
                                <Edit className="h-4 w-4" />
                              </button>
                              <button title="Void / Delete"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                                className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {expanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </td>
                    </tr>

                    {/* ROW 2 — detail / splits */}
                    <tr className={cn("border-b", stripe, isVoid && "opacity-40", !expanded && "border-transparent")}>
                      <td colSpan={8} className={cn("overflow-hidden transition-all duration-200", expanded ? "py-1" : "h-0 py-0")}>
                        {expanded && (
                          <div className="px-6 pb-3 pt-1">
                            {tx.isSplit ? (
                              /* Split detail rows */
                              <div className="border border-violet-100 rounded-lg overflow-hidden">
                                <div className="bg-violet-50 px-3 py-1.5 text-[10px] font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1">
                                  <Scissors className="h-3 w-3" /> Split Transaction ({tx.splits.length} lines)
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-violet-50/50 border-b border-violet-100">
                                      <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Account</th>
                                      <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Vendor</th>
                                      <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Memo</th>
                                      <th className="text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tx.splits.map((s) => (
                                      <tr key={s.id} className="border-t border-violet-50">
                                        <td className="px-3 py-1.5 text-sm">
                                          {s.chartAccount
                                            ? <><span className="font-mono text-xs text-muted-foreground mr-1">{s.chartAccount.code}</span>{s.chartAccount.name}</>
                                            : <span className="italic text-muted-foreground">No account</span>}
                                        </td>
                                        <td className="px-3 py-1.5 text-sm text-muted-foreground">
                                          {s.vendor?.name ?? "\u2014"}
                                        </td>
                                        <td className="px-3 py-1.5 text-sm italic text-muted-foreground">
                                          {s.memo ?? "\u2014"}
                                        </td>
                                        <td className={cn("px-3 py-1.5 text-sm text-right font-medium tabular-nums",
                                          s.amount < 0 ? "text-red-600" : "text-emerald-600")}>
                                          {fmtAmt(s.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="border-t-2 border-violet-200 bg-violet-50/40">
                                      <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground text-right">Total</td>
                                      <td className="px-3 py-1.5 text-sm font-bold text-right tabular-nums">{fmtAmt(tx.amount)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              /* Simple detail */
                              <div className="pl-4 border-l-2 border-[hsl(174,60%,40%)] flex flex-wrap gap-8">
                                <div>
                                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Account / Category</div>
                                  <div className="text-sm">
                                    {tx.chartAccount
                                      ? <><span className="font-mono text-xs text-muted-foreground mr-1">{tx.chartAccount.code}</span>{tx.chartAccount.name}</>
                                      : <span className="italic text-muted-foreground">No account assigned</span>}
                                  </div>
                                </div>
                                {tx.fund && (
                                  <div>
                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Fund</div>
                                    <div className="text-sm">{tx.fund.name}</div>
                                  </div>
                                )}
                                {tx.bankAccount && (
                                  <div>
                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Bank</div>
                                    <div className="text-sm">{tx.bankAccount.name}</div>
                                  </div>
                                )}
                                {tx.memo && (
                                  <div>
                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Memo</div>
                                    <div className="text-sm italic text-muted-foreground">{tx.memo}</div>
                                  </div>
                                )}
                                {tx.referenceNumber && (
                                  <div>
                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Reference</div>
                                    <div className="text-sm">{tx.referenceNumber}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer totals ───────────────────────────── */}
        {filtered.length > 0 && (
          <div className="border-t bg-[hsl(210,40%,97%)] px-6 py-2 flex items-center gap-8 text-sm">
            <span className="text-muted-foreground font-medium">
              {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
            </span>
            <span className="ml-auto text-muted-foreground">
              Payments:&nbsp;<span className="font-semibold text-red-600">{fmtAmt(totals.debits)}</span>
            </span>
            <span className="text-muted-foreground">
              Deposits:&nbsp;<span className="font-semibold text-emerald-600">{fmtAmt(totals.credits)}</span>
            </span>
            <span className="text-muted-foreground">
              Net:&nbsp;
              <span className={cn("font-semibold", totals.credits - totals.debits >= 0 ? "text-emerald-600" : "text-red-600")}>
                {fmtAmt(totals.credits - totals.debits)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ── Transaction Form Dialog ──────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editTx ? "Edit Transaction" : "Add Transaction"}
              {form.isSplit && <span className="text-xs font-normal text-violet-600 flex items-center gap-1"><Scissors className="h-3.5 w-3.5" /> Split mode</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}

            {/* Row 1: Date + Type + Amount + Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Payment (Debit)</SelectItem>
                    <SelectItem value="CREDIT">Deposit (Credit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Bank Total *</Label>
                {editTx?.plaidTransactionId ? (
                  <div className="relative">
                    <Input
                      type="number" step="0.01"
                      value={form.amount}
                      readOnly
                      className="bg-slate-50 text-muted-foreground cursor-not-allowed pr-14"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-none">
                      Plaid
                    </span>
                  </div>
                ) : (
                  <Input
                    type="number" step="0.01" placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                )}
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNCLEARED">Uncleared</SelectItem>
                    <SelectItem value="CLEARED">Cleared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payee + Vendor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payee Name *</Label>
                <Input
                  placeholder="Who is this transaction with?"
                  value={form.payee}
                  onChange={(e) => setForm({ ...form, payee: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Vendor (searchable)</Label>
                <VendorCombobox
                  value={form.vendorId}
                  vendors={vendorList}
                  onChange={(id, name) => {
                    setForm((f) => ({ ...f, vendorId: id, payee: name || f.payee }));
                  }}
                  onAddNew={() => setShowAddVendor(true)}
                />
              </div>
            </div>

            {/* Donor Name (shown only for credit/income transactions) */}
            {form.type === "CREDIT" && (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <div className="flex-1">
                  <Label className="text-xs text-emerald-800 font-semibold">Donor Name <span className="font-normal text-emerald-600">(optional)</span></Label>
                  <Input
                    className="mt-1 bg-white border-emerald-200 focus-visible:ring-emerald-300"
                    placeholder="e.g. Jane Smith or Smith Family Foundation"
                    value={form.donorName}
                    onChange={(e) => setForm({ ...form, donorName: e.target.value })}
                  />
                  <p className="text-[10px] text-emerald-700 mt-1">Tagging a donor links this gift to the Donor Giving tracker.</p>
                </div>
              </div>
            )}

            {/* Bank + Fund */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Bank Account</Label>
                <Select
                  value={form.bankAccountId || "__none__"}
                  onValueChange={(v) => setForm({ ...form, bankAccountId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select bank\u2026" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fund</Label>
                <Select
                  value={form.fundId || "__none__"}
                  onValueChange={(v) => setForm({ ...form, fundId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select fund\u2026" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {fundList.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{fundLabel(f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Check + Ref + Memo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Check #</Label>
                <Input placeholder="e.g. 1042" value={form.checkNumber}
                  onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Reference #</Label>
                <Input placeholder="Optional" value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Memo</Label>
                <Input placeholder="Optional" value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>

            {/* Split toggle */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isSplit: !f.isSplit }))}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors",
                  form.isSplit
                    ? "bg-violet-50 border-violet-300 text-violet-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                )}
              >
                <Scissors className="h-4 w-4" />
                {form.isSplit ? "Split Transaction ON" : "Split Transaction"}
              </button>
              {!form.isSplit && (
                <div className="flex-1">
                  <CoaSelect
                    value={form.chartAccountId}
                    coaList={coaList}
                    onChange={(id) => setForm((f) => ({ ...f, chartAccountId: id, functionalType: "" }))}
                    onAddNew={() => setShowAddAccount(true)}
                  />
                </div>
              )}
            </div>

            {/* Functional Type (990) — shown only when a non-split expense account is selected */}
            {!form.isSplit && coaList.find((a) => a.id === form.chartAccountId)?.type === "EXPENSE" && (
              <div className="flex items-center gap-3 px-1 pt-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200 shrink-0">
                  990 Tag
                </div>
                <div className="flex-1">
                  <select
                    value={form.functionalType}
                    onChange={(e) => setForm((f) => ({ ...f, functionalType: e.target.value }))}
                    className={cn(
                      "w-full text-sm rounded-md border px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300",
                      !form.functionalType ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200"
                    )}
                  >
                    <option value="">— Select Functional Type (required for 990) —</option>
                    {FUNCTIONAL_TYPES.map((ft) => (
                      <option key={ft.value} value={ft.value}>{ft.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* ── Split Rows ──────────────────────────── */}
            {form.isSplit && (
              <div className="border border-violet-200 rounded-lg overflow-hidden">
                <div className="bg-violet-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                    <Scissors className="h-3.5 w-3.5" /> Split Lines
                  </span>
                  {/* Sum indicator */}
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded",
                    splitValid
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  )}>
                    {splitValid
                      ? <CheckCheck className="h-3.5 w-3.5" />
                      : <AlertCircle className="h-3.5 w-3.5" />}
                    {fmtAmt(splitSum)} / {fmtAmt(bankTotal)}
                    {!splitValid && ` (diff: ${fmtAmt(splitDiff)})`}
                  </div>
                </div>

                {/* Column headers — desktop only */}
                <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_80px_32px] gap-2 px-4 py-1.5 bg-violet-50/50 border-b border-violet-100">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Account</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Vendor</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Memo</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-right">Amount</span>
                  <span></span>
                </div>

                {form.splits.map((split, idx) => {
                  const splitAccountType = coaList.find((a) => a.id === split.chartAccountId)?.type;
                  const isExpenseSplit = splitAccountType === "EXPENSE";
                  return (
                    <div key={split.id} className="border-b border-violet-50">
                      {/* Mobile layout: stacked */}
                      <div className="sm:hidden px-3 pt-2 pb-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Line {idx + 1}</span>
                          <button
                            onClick={() => removeSplitRow(idx)}
                            disabled={form.splits.length === 1}
                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <CoaSelect
                          value={split.chartAccountId}
                          coaList={coaList}
                          onChange={(id) => { updateSplit(idx, "chartAccountId", id); updateSplit(idx, "functionalType", ""); }}
                          onAddNew={() => setShowAddAccount(true)}
                        />
                        {isExpenseSplit && (
                          <select
                            value={split.functionalType}
                            onChange={(e) => updateSplit(idx, "functionalType", e.target.value)}
                            className={cn("w-full text-xs rounded border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300",
                              !split.functionalType ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 bg-white")}
                          >
                            <option value="">990 Functional Type…</option>
                            {FUNCTIONAL_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                          </select>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <VendorCombobox value={split.vendorId} vendors={vendorList}
                            onChange={(id) => updateSplit(idx, "vendorId", id)}
                            onAddNew={() => setShowAddVendor(true)} placeholder="Vendor (optional)" />
                          <Input className="text-sm text-right font-mono" type="number" step="0.01" placeholder="0.00"
                            value={split.amount} onChange={(e) => updateSplit(idx, "amount", e.target.value)} />
                        </div>
                        <Input className="text-sm" placeholder="Memo (optional)"
                          value={split.memo} onChange={(e) => updateSplit(idx, "memo", e.target.value)} />
                      </div>
                      {/* Desktop layout: grid */}
                      <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_80px_32px] gap-2 items-start px-4 pt-2 pb-1">
                        <div className="space-y-1">
                          <CoaSelect
                            value={split.chartAccountId}
                            coaList={coaList}
                            onChange={(id) => {
                              updateSplit(idx, "chartAccountId", id);
                              updateSplit(idx, "functionalType", "");
                            }}
                            onAddNew={() => setShowAddAccount(true)}
                          />
                          {isExpenseSplit && (
                            <select
                              value={split.functionalType}
                              onChange={(e) => updateSplit(idx, "functionalType", e.target.value)}
                              className={cn(
                                "w-full text-xs rounded border px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300",
                                !split.functionalType
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-gray-200 bg-white text-gray-700"
                              )}
                            >
                              <option value="">990 Functional Type…</option>
                              {FUNCTIONAL_TYPES.map((ft) => (
                                <option key={ft.value} value={ft.value}>{ft.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <VendorCombobox
                          value={split.vendorId}
                          vendors={vendorList}
                          onChange={(id, _name) => updateSplit(idx, "vendorId", id)}
                          onAddNew={() => setShowAddVendor(true)}
                          placeholder="Vendor (optional)"
                        />
                        <Input
                          className="text-sm" placeholder="Memo"
                          value={split.memo}
                          onChange={(e) => updateSplit(idx, "memo", e.target.value)}
                        />
                        <Input
                          className="text-sm text-right font-mono"
                          type="number" step="0.01" placeholder="0.00"
                          value={split.amount}
                          onChange={(e) => updateSplit(idx, "amount", e.target.value)}
                        />
                        <button
                          onClick={() => removeSplitRow(idx)}
                          disabled={form.splits.length === 1}
                          className="p-1 mt-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="px-4 py-2 flex items-center justify-between bg-white">
                  <button
                    onClick={addSplitRow}
                    className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-800 font-medium"
                  >
                    <Plus className="h-4 w-4" /> Add Split Line
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Tip: use negative amounts (e.g. &minus;$3.20) for fees deducted from a deposit.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !form.date ||
                !form.payee ||
                !form.amount ||
                !splitValid ||
                (!form.isSplit && !form.chartAccountId) ||
                (!form.isSplit && !form.fundId)
              }
              className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
            >
              {saving ? "Saving\u2026" : editTx ? "Save Changes" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Vendor Modal ───────────────────────── */}
      <AddVendorModal
        open={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        onCreated={(v) => {
          setVendorList((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
          setForm((f) => ({ ...f, vendorId: v.id, payee: v.name }));
          setShowAddVendor(false);
        }}
      />

      {/* ── Add Account Modal ──────────────────────── */}
      <AddAccountModal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onCreated={(a) => {
          setCoaList((prev) => [...prev, a].sort((x, y) => x.code.localeCompare(y.code)));
          setForm((f) => ({ ...f, chartAccountId: a.id }));
          setShowAddAccount(false);
        }}
      />

      {/* ── Void Confirm ───────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will remove this record from the General Ledger and update your Bank Balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && handleVoid(deleteTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Journal Entry Detail Modal ──────────────── */}
      <Dialog open={jeModal.open} onOpenChange={(o) => { if (!o) setJeModal({ open: false, data: null, loading: false }); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Journal Entry Details
              {jeModal.data && (
                <span className="ml-2 text-sm font-normal text-muted-foreground font-mono">
                  {jeModal.data.entryNumber}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {jeModal.loading && (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
          )}

          {!jeModal.loading && jeModal.data && (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-slate-50 border text-sm">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Date</div>
                  <div>{format(parseISO(jeModal.data.date), "MMMM d, yyyy")}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Status</div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full border",
                    jeModal.data.status === "POSTED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : jeModal.data.status === "VOID"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                  )}>
                    {jeModal.data.status}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Description</div>
                  <div>{jeModal.data.description ?? "—"}</div>
                </div>
                {jeModal.data.memo && (
                  <div className="col-span-2 sm:col-span-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Memo</div>
                    <div className="italic text-muted-foreground">{jeModal.data.memo}</div>
                  </div>
                )}
              </div>

              {/* Lines table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Debit</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(jeModal.data.lines ?? []).map((line: any, i: number) => (
                      <tr key={i} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                        <td className="px-4 py-2.5">
                          {line.account ? (
                            <>
                              <span className="font-mono text-xs text-muted-foreground mr-1">{line.account.code}</span>
                              {line.account.name}
                            </>
                          ) : (
                            <span className="italic text-muted-foreground">Unknown account</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {line.fund?.name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {(line.debit ?? 0) > 0
                            ? <span className="text-foreground font-medium">{fmtAmt(line.debit)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {(line.credit ?? 0) > 0
                            ? <span className="text-foreground font-medium">{fmtAmt(line.credit)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground italic text-xs">
                          {line.description ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals footer */}
                  {jeModal.data.lines?.length > 0 && (() => {
                    const totalDr = (jeModal.data.lines as any[]).reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
                    const totalCr = (jeModal.data.lines as any[]).reduce((s: number, l: any) => s + (l.credit ?? 0), 0);
                    return (
                      <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-muted-foreground text-right uppercase tracking-wide">
                            Totals
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtAmt(totalDr)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtAmt(totalCr)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setJeModal({ open: false, data: null, loading: false })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importCsvOpen} onOpenChange={setImportCsvOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import bank statement</DialogTitle>
          </DialogHeader>
          <div className="flex rounded-lg border border-input p-0.5 gap-0.5 bg-muted/40">
            <button
              type="button"
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                importKind === "csv" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setImportKind("csv")}
            >
              CSV export
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                importKind === "pdf" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setImportKind("pdf")}
            >
              PDF (text)
            </button>
          </div>
          {importKind === "csv" ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use your bank’s <strong>Download CSV</strong> option. We detect <strong>Date</strong>,{" "}
              <strong>Amount</strong> (or Debit/Credit columns), and description. Negative amounts = payments; positive = deposits.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upload a PDF that has <strong>selectable text</strong> (not a scan/photo). We parse lines that look like{" "}
              <strong>date + description + amount</strong>. If nothing imports, use CSV instead — it’s more reliable.
            </p>
          )}
          <div className="space-y-2">
            <Label className="text-xs">Bank account</Label>
            <Select value={importBankId} onValueChange={setImportBankId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {importKind === "csv" ? (
            <div className="space-y-2">
              <Label className="text-xs">CSV file</Label>
              <Input ref={csvFileRef} type="file" accept=".csv,text/csv" className="h-9 text-sm cursor-pointer" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">PDF file</Label>
              <Input ref={pdfFileRef} type="file" accept="application/pdf,.pdf" className="h-9 text-sm cursor-pointer" />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setImportCsvOpen(false)} disabled={importingCsv}>
              Cancel
            </Button>
            <Button
              className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
              onClick={handleImportStatement}
              disabled={importingCsv}
            >
              {importingCsv ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
