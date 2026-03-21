import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Plus, ChevronDown, ChevronUp, CheckCircle, Circle,
  RefreshCw, Edit, Wallet, Scissors, Trash2, Search,
  AlertCircle, CheckCheck, Lock, FileText,
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

const BASE = import.meta.env.BASE_URL;

function apiFetch(url: string, init?: RequestInit) {
  return fetch(url, { credentials: "include", ...init });
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
interface Transaction {
  id: string; date: string; payee: string; amount: number;
  type: "DEBIT" | "CREDIT";
  status: "UNCLEARED" | "CLEARED" | "RECONCILED" | "VOID";
  checkNumber: string | null; referenceNumber: string | null; memo: string | null;
  isVoid: boolean; isSplit: boolean; isClosed?: boolean;
  journalEntryId: string | null;
  plaidTransactionId?: string | null;
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

// ── COA Combobox (with + Add New Account) ─────────────────────────────────────
function CoaSelect({
  value, onChange, coaList, onAddNew,
}: {
  value: string; onChange: (id: string) => void; coaList: ChartAccount[]; onAddNew: () => void;
}) {
  return (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => {
        if (v === "__add__") { onAddNew(); return; }
        onChange(v === "__none__" ? "" : v);
      }}
    >
      <SelectTrigger className="text-sm">
        <SelectValue placeholder="Account / Category\u2026" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— None —</SelectItem>
        {coaList.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="font-mono text-xs mr-1 text-muted-foreground">{a.code}</span>
            {a.name}
          </SelectItem>
        ))}
        <SelectItem value="__add__" className="text-[hsl(174,60%,40%)] font-medium border-t mt-1">
          <Plus className="h-3.5 w-3.5 inline mr-1" /> Add New Account
        </SelectItem>
      </SelectContent>
    </Select>
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
      const res = await apiFetch(`${BASE}api/vendors`, {
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
      const res = await apiFetch(`${BASE}api/chart-of-accounts`, {
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
        apiFetch(`${BASE}api/bank-accounts`),
        apiFetch(`${BASE}api/chart-of-accounts`),
        apiFetch(`${BASE}api/funds`),
        apiFetch(`${BASE}api/vendors`),
        apiFetch(`${BASE}api/transactions`),
      ]);
      if (banksR.ok) setBankAccounts(await banksR.json());
      if (coaR.ok) setCoaList(await coaR.json());
      if (fundsR.ok) { const d = await fundsR.json(); setFundList(Array.isArray(d) ? d : (d.data ?? [])); }
      if (vendorsR.ok) setVendorList(await vendorsR.json());
      if (txR.ok) {
        const txData = await txR.json();
        if (Array.isArray(txData)) {
          setTxList(txData);
        } else {
          setTxList(txData.transactions ?? []);
          setClosedUntil(txData.closedUntil ?? null);
        }
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const filtered = txList.filter((t) => {
    if (selectedBank !== "ALL" && t.bankAccount?.id !== selectedBank) return false;
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
      const res = await apiFetch(`${BASE}api/journal-entries/${journalEntryId}`);
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
      const res = await apiFetch(`${BASE}api/transactions/${txId}/splits`);
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
      bankAccountId: tx.bankAccount?.id ?? "",
      memo: tx.memo ?? "",
      checkNumber: tx.checkNumber ?? "",
      referenceNumber: tx.referenceNumber ?? "",
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

      const url = editTx ? `${BASE}api/transactions/${editTx.id}` : `${BASE}api/transactions`;
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
    await apiFetch(`${BASE}api/transactions/${tx.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await loadAll();
    globalRefetch();
  }

  async function toggleStatus(tx: Transaction) {
    const next = tx.status === "CLEARED" ? "UNCLEARED" : "CLEARED";
    await apiFetch(`${BASE}api/transactions/${tx.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
    globalRefetch();
  }

  async function handlePlaidSync(bankAccountId: string) {
    setSyncing(true);
    try {
      const res = await apiFetch(`${BASE}api/plaid/sync/${bankAccountId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const msg = json.imported > 0
        ? `Imported ${json.imported} new transaction${json.imported !== 1 ? "s" : ""}${json.skipped > 0 ? ` (${json.skipped} already existed)` : ""}`
        : `All ${json.total} transactions already up to date`;
      toast.success(msg);
      await loadAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync transactions");
    } finally {
      setSyncing(false);
    }
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
                  .filter(t => !t.isVoid && t.bankAccount?.id === selectedBankObj.id)
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
                    {loading ? "Loading\u2026" : "No transactions yet. Click \u201cAdd Transaction\u201d to get started."}
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
                        {/* Always visible on mobile/tablet, hover-only on desktop */}
                        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
    </AppLayout>
  );
}
