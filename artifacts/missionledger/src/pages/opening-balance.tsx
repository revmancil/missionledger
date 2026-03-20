import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Lock, RotateCcw,
  Info, Plus, Trash2, Layers, Calendar, X, ArrowLeftRight,
  Search, ChevronDown, Download, Upload, Landmark, Scale,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

// ── Types ─────────────────────────────────────────────────────────────────────
type Method    = "CASH" | "ACCRUAL";
type EntryType = "DEBIT" | "CREDIT";

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  isSystem?: boolean;
  isLinkedBankAccount?: boolean;
  linkedBankName?: string;
  isPlaidLinked?: boolean;
}

interface FundRecord {
  id: string;
  name: string;
  fundType?: string;
}

// Bank/Cash row — always a DEBIT (asset balance)
interface BankRow {
  id: string;
  accountId: string;
  fundId: string;
  amount: string;
  memo: string;
}

// Other row — ASSET (DEBIT) or LIABILITY (CREDIT)
interface OtherRow {
  id: string;
  accountId: string;
  fundId: string;
  amount: string;
  entryType: EntryType;
  memo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const uid = () => crypto.randomUUID();

// ── Account Combobox ──────────────────────────────────────────────────────────
const GROUP_LABELS: Record<string, string> = {
  ASSET:     "Assets",
  LIABILITY: "Liabilities",
  EQUITY:    "Net Assets / Equity",
};
const GROUP_ORDER = ["ASSET", "LIABILITY", "EQUITY"] as const;
const GROUP_HEADER_CLS: Record<string, string> = {
  ASSET:     "bg-blue-50 text-blue-700 border-blue-100",
  LIABILITY: "bg-orange-50 text-orange-700 border-orange-100",
  EQUITY:    "bg-violet-50 text-violet-700 border-violet-100",
};

function AccountCombobox({
  accounts, value, onChange, onAddNew, placeholder = "Search account…",
}: {
  accounts: CoaAccount[];
  value: string;
  onChange: (id: string) => void;
  onAddNew: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const containerRef      = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  const selected = accounts.find((a) => a.id === value);

  const filteredFlat = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return accounts
      .filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [accounts, query]);

  const grouped = useMemo(() => {
    const map: Record<string, CoaAccount[]> = { ASSET: [], LIABILITY: [], EQUITY: [] };
    for (const a of accounts) {
      const key = a.type as keyof typeof map;
      if (map[key]) map[key].push(a);
    }
    return map;
  }, [accounts]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayValue = open
    ? query
    : selected
    ? `${selected.code} — ${selected.linkedBankName ?? selected.name}`
    : "";

  const renderOption = (a: CoaAccount) => (
    <button
      key={a.id}
      className={cn(
        "w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors",
        a.id === value && "bg-blue-50"
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        onChange(a.id);
        setOpen(false);
        setQuery("");
      }}
    >
      <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{a.code}</span>
      <span className="flex-1 truncate">{a.linkedBankName ?? a.name}</span>
    </button>
  );

  return (
    <div ref={containerRef} className="relative w-full min-w-[180px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={displayValue}
          placeholder={placeholder}
          className={cn(
            "w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)]",
            !value ? "border-amber-300" : "border-gray-200"
          )}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && !open && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onMouseDown={(e) => { e.preventDefault(); onChange(""); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!value && (
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
          {filteredFlat ? (
            <>
              {filteredFlat.map(renderOption)}
              {filteredFlat.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No accounts match</div>
              )}
            </>
          ) : (
            GROUP_ORDER.map((type) => {
              const items = grouped[type] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={type}>
                  <div className={cn("px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b", GROUP_HEADER_CLS[type])}>
                    {GROUP_LABELS[type]} ({items.length})
                  </div>
                  {items.map(renderOption)}
                </div>
              );
            })
          )}
          <div className="border-t border-gray-100 px-3 py-2">
            <button
              className="text-sm text-[hsl(210,60%,35%)] font-semibold hover:underline flex items-center gap-1"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAddNew(); }}
            >
              <Plus className="h-3.5 w-3.5" /> Add new account…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Fund Select ───────────────────────────────────────────────────────────────
function FundSelect({ funds, value, onChange }: { funds: FundRecord[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full h-9 px-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)]",
        !value ? "border-amber-300" : "border-gray-200"
      )}
    >
      <option value="">— Fund —</option>
      {funds.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  );
}

// ── Method Toggle ─────────────────────────────────────────────────────────────
function MethodToggle({ value, onChange }: { value: Method; onChange: (v: Method) => void }) {
  return (
    <div className="inline-flex rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-50">
      {(["CASH", "ACCRUAL"] as Method[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-4 py-1.5 text-sm font-semibold transition-all duration-150",
            value === m
              ? m === "CASH"
                ? "bg-[hsl(210,60%,25%)] text-white shadow-sm"
                : "bg-[hsl(174,60%,38%)] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {m === "CASH" ? "Cash Basis" : "Accrual Basis"}
        </button>
      ))}
    </div>
  );
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AddAccountModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (a: CoaAccount) => void }) {
  const [code, setCode]   = useState("");
  const [name, setName]   = useState("");
  const [type, setType]   = useState<"ASSET" | "LIABILITY" | "EQUITY">("ASSET");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setCode(""); setName(""); setType("ASSET"); setError(""); setTimeout(() => nameRef.current?.focus(), 80); }
  }, [open]);

  async function handleSave() {
    setError("");
    if (!code.trim()) { setError("Account code is required."); return; }
    if (!name.trim()) { setError("Account name is required."); return; }
    setSaving(true);
    try {
      const res = await api(`${BASE}api/chart-of-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name: name.trim(), type, sortOrder: parseInt(code.trim()) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create account."); return; }
      onCreated(data as CoaAccount);
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(210,60%,25%)]">
            <Plus className="h-4 w-4" /> Add New Account
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1050" className="mt-1 h-9 font-mono" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Name</Label>
              <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking Account" className="mt-1 h-9" onKeyDown={(e) => e.key === "Enter" && handleSave()} />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Type</Label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="mt-1 w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)]">
              <option value="ASSET">Asset (1000–1999)</option>
              <option value="LIABILITY">Liability (2000–2999)</option>
              <option value="EQUITY">Equity / Net Assets (3000–3999)</option>
            </select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !code.trim() || !name.trim()} className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white gap-2">
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</> : <><Plus className="h-4 w-4" /> Add Account</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  open, onClose, onConfirm, saving, error, submitRows, allCoa, funds, asOfDate, method,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string;
  submitRows: Array<{ accountId: string; fundId: string; amount: number; entryType: EntryType; memo: string | null }>;
  allCoa: CoaAccount[];
  funds: FundRecord[];
  asOfDate: string;
  method: Method;
}) {
  const acctMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const fundMap = Object.fromEntries(funds.map((f) => [f.id, f]));
  const totalDebits  = submitRows.filter((r) => r.entryType === "DEBIT").reduce((s, r) => s + r.amount, 0);
  const totalCredits = submitRows.filter((r) => r.entryType === "CREDIT").reduce((s, r) => s + r.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(210,60%,25%)]">
            <ArrowLeftRight className="h-5 w-5" /> Review Opening Balance Entry
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex flex-wrap gap-4 text-sm">
            <div><span className="text-muted-foreground">Date:</span> <strong>{asOfDate ? format(new Date(asOfDate), "MMMM d, yyyy") : "—"}</strong></div>
            <div><span className="text-muted-foreground">Method:</span> <strong>{method === "CASH" ? "Cash Basis" : "Accrual Basis"}</strong></div>
            <div><span className="text-muted-foreground">Lines:</span> <strong>{submitRows.length}</strong></div>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Debit</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {submitRows.map((row, idx) => {
                  const acct = acctMap[row.accountId];
                  const fund = fundMap[row.fundId];
                  return (
                    <tr key={idx} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{acct?.code}</span>
                        <span className="font-medium">{acct?.linkedBankName ?? acct?.name ?? "—"}</span>
                        {row.memo && <div className="text-xs text-muted-foreground mt-0.5 italic">{row.memo}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fund?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">
                        {row.entryType === "DEBIT" ? fmt(row.amount) : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                        {row.entryType === "CREDIT" ? fmt(row.amount) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                  <td className="px-4 py-2.5 text-sm" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{fmt(totalDebits)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
            <Info className="h-4 w-4 shrink-0" />
            Posts <strong>{submitRows.length} lines</strong> to the GL with source type <code className="bg-blue-100 px-1 rounded text-xs">OPENING_BALANCE</code>. Any existing opening balance entry will be voided and replaced.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={onConfirm} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[160px]">
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Posting…</>
              : <><CheckCircle2 className="h-4 w-4" /> Post Opening Balances</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OpeningBalancePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [phase, setPhase]       = useState<"wizard" | "done">("wizard");
  const [method, setMethod]     = useState<Method>("CASH");
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [defaultFundId, setDefaultFundId] = useState("");
  const [showConfirm, setShowConfirm]     = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountSection, setAddAccountSection] = useState<"bank" | "other" | null>(null);
  const [addAccountRowId, setAddAccountRowId]   = useState<string | null>(null);
  const [existingEntryId, setExistingEntryId]   = useState<string | null>(null);
  const [createdEntry, setCreatedEntry]         = useState<any | null>(null);
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [allCoa, setAllCoa] = useState<CoaAccount[]>([]);
  const [funds, setFunds]   = useState<FundRecord[]>([]);

  // ── Two-section row state ────────────────────────────────────────────────────
  const [bankRows, setBankRows]   = useState<BankRow[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);
  // Per-fund equity account override: fundId → equityAccountId
  const [fundEquityMap, setFundEquityMap] = useState<Record<string, string>>({});

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`${BASE}api/opening-balance`);
      if (!res.ok) return;
      const data = await res.json();

      setMethod(data.accountingMethod ?? "CASH");
      setAllCoa(data.coa ?? []);
      setFunds(data.funds ?? []);
      setExistingEntryId(data.openingBalanceEntryId ?? null);
      if (data.openingBalanceDate) setAsOfDate(data.openingBalanceDate.slice(0, 10));

      const firstFundId = (data.funds ?? [])[0]?.id ?? "";
      if (firstFundId && !defaultFundId) setDefaultFundId(firstFundId);

      if (data.existingRows?.length) {
        const newBank: BankRow[]  = [];
        const newOther: OtherRow[] = [];
        const coaMap: Record<string, CoaAccount> = Object.fromEntries(
          (data.coa ?? []).map((a: CoaAccount) => [a.id, a])
        );

        for (const r of data.existingRows) {
          const acct = coaMap[r.accountId];
          if (!acct || acct.type === "EQUITY") continue;

          const fid = r.fundId ?? firstFundId;
          const amt = String(r.amount ?? "");
          const memo = r.memo ?? "";

          if (acct.type === "ASSET" && r.entryType === "DEBIT") {
            // Bank accounts → Bank section; other assets → Other section
            if (acct.isLinkedBankAccount) {
              newBank.push({ id: uid(), accountId: r.accountId, fundId: fid, amount: amt, memo });
            } else {
              newOther.push({ id: uid(), accountId: r.accountId, fundId: fid, amount: amt, entryType: "DEBIT", memo });
            }
          } else if (acct.type === "LIABILITY" && r.entryType === "CREDIT") {
            newOther.push({ id: uid(), accountId: r.accountId, fundId: fid, amount: amt, entryType: "CREDIT", memo });
          }
        }

        setBankRows(newBank.length ? newBank : [{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setOtherRows(newOther.length ? newOther : [{ id: uid(), accountId: "", fundId: firstFundId, amount: "", entryType: "DEBIT", memo: "" }]);
      } else {
        setBankRows([{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setOtherRows([{ id: uid(), accountId: "", fundId: firstFundId, amount: "", entryType: "DEBIT", memo: "" }]);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sorted / filtered COA ────────────────────────────────────────────────────
  const sortedCoa = useMemo(() =>
    [...allCoa].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [allCoa]
  );
  const assetCoa   = useMemo(() => sortedCoa.filter((a) => a.type === "ASSET"),     [sortedCoa]);
  const otherBsCoa = useMemo(() => sortedCoa.filter((a) => ["ASSET", "LIABILITY"].includes(a.type)), [sortedCoa]);
  const equityCoa  = useMemo(() => sortedCoa.filter((a) => a.type === "EQUITY"),    [sortedCoa]);

  // ── Method change ─────────────────────────────────────────────────────────────
  async function handleMethodChange(m: Method) {
    setMethod(m);
    await api(`${BASE}api/opening-balance/method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingMethod: m }),
    });
  }

  // ── Bank row operations ───────────────────────────────────────────────────────
  function addBankRow() {
    setBankRows((prev) => [...prev, { id: uid(), accountId: "", fundId: defaultFundId, amount: "", memo: "" }]);
  }
  function deleteBankRow(id: string) {
    setBankRows((prev) => prev.length <= 1 ? prev : prev.filter((r) => r.id !== id));
  }
  function updateBankRow(id: string, patch: Partial<Omit<BankRow, "id">>) {
    setBankRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  // ── Other row operations ──────────────────────────────────────────────────────
  function addOtherRow() {
    setOtherRows((prev) => [...prev, { id: uid(), accountId: "", fundId: defaultFundId, amount: "", entryType: "DEBIT", memo: "" }]);
  }
  function deleteOtherRow(id: string) {
    setOtherRows((prev) => prev.length <= 1 ? prev : prev.filter((r) => r.id !== id));
  }
  function updateOtherRow(id: string, patch: Partial<Omit<OtherRow, "id">>) {
    setOtherRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }
  function handleOtherAccountSelect(rowId: string, accountId: string) {
    const acct = allCoa.find((a) => a.id === accountId);
    const entryType: EntryType = acct?.type === "LIABILITY" ? "CREDIT" : "DEBIT";
    updateOtherRow(rowId, { accountId, entryType });
  }

  // ── Computed totals ───────────────────────────────────────────────────────────
  const totalBankAssets = useMemo(
    () => bankRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [bankRows]
  );

  const totalOtherAssets = useMemo(
    () => otherRows
      .filter((r) => r.entryType === "DEBIT")
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [otherRows]
  );

  const totalLiabilities = useMemo(
    () => otherRows
      .filter((r) => r.entryType === "CREDIT")
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [otherRows]
  );

  const totalAssets    = totalBankAssets + totalOtherAssets;
  const totalNetAssets = totalAssets - totalLiabilities;

  // ── Per-fund net assets (auto-computed Fund Balances) ─────────────────────────
  const fundBalances = useMemo(() => {
    const map: Record<string, number> = {};

    for (const r of bankRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.fundId) map[r.fundId] = (map[r.fundId] || 0) + amt;
    }

    for (const r of otherRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.fundId) {
        if (r.entryType === "DEBIT")  map[r.fundId] = (map[r.fundId] || 0) + amt;
        if (r.entryType === "CREDIT") map[r.fundId] = (map[r.fundId] || 0) - amt;
      }
    }

    return Object.entries(map)
      .filter(([, n]) => Math.abs(n) > 0.001)
      .map(([fundId, netAmount]) => ({
        fundId,
        netAmount,
        equityAccountId: fundEquityMap[fundId] ?? equityCoa[0]?.id ?? "",
      }));
  }, [bankRows, otherRows, fundEquityMap, equityCoa]);

  const totalFundBalances = fundBalances.reduce((s, fb) => s + fb.netAmount, 0);

  // ── Validation ───────────────────────────────────────────────────────────────
  const futureDateError    = asOfDate > format(new Date(), "yyyy-MM-dd");
  const activeBankRows     = bankRows.filter((r) => parseFloat(r.amount) > 0);
  const activeOtherRows    = otherRows.filter((r) => parseFloat(r.amount) > 0);
  const missingBankAcct    = activeBankRows.some((r) => !r.accountId);
  const missingBankFund    = activeBankRows.some((r) => !r.fundId);
  const missingOtherAcct   = activeOtherRows.some((r) => !r.accountId);
  const missingOtherFund   = activeOtherRows.some((r) => !r.fundId);
  const missingEquity      = fundBalances.some((fb) => !fb.equityAccountId);
  const hasData            = totalAssets > 0;

  const canPost = hasData && !futureDateError
    && !missingBankAcct && !missingBankFund
    && !missingOtherAcct && !missingOtherFund
    && !missingEquity && funds.length > 0;

  // ── Build final submit rows ───────────────────────────────────────────────────
  const finalSubmitRows = useMemo(() => {
    const rows: Array<{ accountId: string; fundId: string; amount: number; entryType: EntryType; memo: string | null }> = [];

    for (const r of bankRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.accountId && r.fundId)
        rows.push({ accountId: r.accountId, fundId: r.fundId, amount: amt, entryType: "DEBIT", memo: r.memo || null });
    }

    for (const r of otherRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.accountId && r.fundId)
        rows.push({ accountId: r.accountId, fundId: r.fundId, amount: amt, entryType: r.entryType, memo: r.memo || null });
    }

    for (const fb of fundBalances) {
      if (Math.abs(fb.netAmount) > 0.001 && fb.equityAccountId && fb.fundId) {
        const fund = funds.find((f) => f.id === fb.fundId);
        rows.push({
          accountId: fb.equityAccountId,
          fundId: fb.fundId,
          amount: Math.abs(fb.netAmount),
          entryType: fb.netAmount >= 0 ? "CREDIT" : "DEBIT",
          memo: `Opening Net Assets — ${fund?.name ?? "Fund"}`,
        });
      }
    }

    return rows;
  }, [bankRows, otherRows, fundBalances, funds]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      const res = await api(`${BASE}api/opening-balance/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: asOfDate, accountingMethod: method, rows: finalSubmitRows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save opening balance"); return; }
      setCreatedEntry(data);
      setShowConfirm(false);
      setPhase("done");
    } finally { setSaving(false); }
  }

  // ── Force sync ────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await api(`${BASE}api/opening-balance/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setSyncResult(`Error: ${data.error ?? "Sync failed"}`); return; }
      const updated = data.bankBalancesUpdated?.length ?? 0;
      const txs     = data.transactionsCreated?.length ?? 0;
      setSyncResult(`Sync complete — ${updated} bank balance(s) updated, ${txs} transaction(s) created.`);
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally { setSyncing(false); }
  }

  // ── CSV template download ─────────────────────────────────────────────────────
  function downloadTemplate() {
    const header = ["Section", "Account Code", "Account Name", "Fund Name", "Amount", "Type (Asset/Liability)", "Memo"];
    const examples = [
      ["Bank/Cash", "1010", "Checking Account", "General Fund", "50000.00", "Asset", "Opening bank balance"],
      ["Bank/Cash", "1010", "Checking Account", "City of Colony Fund", "20000.00", "Asset", "Restricted portion"],
      ["Bank/Cash", "1020", "Savings Account", "General Fund", "10000.00", "Asset", "Savings balance"],
      ["Other", "1100", "Accounts Receivable", "General Fund", "5000.00", "Asset", "Outstanding receivables"],
      ["Other", "2010", "Accounts Payable", "General Fund", "3000.00", "Liability", "Outstanding payables"],
    ];
    const csv = [header, ...examples].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "opening-balance-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV import ────────────────────────────────────────────────────────────────
  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text  = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;
      const parse = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "").trim());
      const hdr = parse(lines[0]).map((h) => h.toLowerCase());
      const sIdx = hdr.findIndex((h) => h.includes("section"));
      const cIdx = hdr.findIndex((h) => h.includes("account code"));
      const fIdx = hdr.findIndex((h) => h.includes("fund"));
      const aIdx = hdr.findIndex((h) => h.includes("amount"));
      const tIdx = hdr.findIndex((h) => h.includes("type") && !h.includes("account"));
      const mIdx = hdr.findIndex((h) => h.includes("memo"));
      const newBank: BankRow[] = []; const newOther: OtherRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parse(lines[i]);
        if (!cols[cIdx]) continue;
        const acct  = allCoa.find((a) => a.code === cols[cIdx]);
        const fund  = funds.find((f) => f.name.toLowerCase() === (cols[fIdx] ?? "").toLowerCase());
        const section = (cols[sIdx] ?? "").toLowerCase();
        const typRaw  = (cols[tIdx] ?? "asset").toLowerCase();
        const entryType: EntryType = typRaw.includes("liab") ? "CREDIT" : "DEBIT";
        if (section.includes("bank") || section.includes("cash")) {
          newBank.push({ id: uid(), accountId: acct?.id ?? "", fundId: fund?.id ?? defaultFundId, amount: cols[aIdx] ?? "", memo: cols[mIdx] ?? "" });
        } else {
          newOther.push({ id: uid(), accountId: acct?.id ?? "", fundId: fund?.id ?? defaultFundId, amount: cols[aIdx] ?? "", entryType, memo: cols[mIdx] ?? "" });
        }
      }
      if (newBank.length)  setBankRows(newBank);
      if (newOther.length) setOtherRows(newOther);
    };
    reader.readAsText(file);
  }

  // ── Account created ───────────────────────────────────────────────────────────
  function handleAccountCreated(newAcct: CoaAccount) {
    setAllCoa((prev) => [...prev, newAcct]);
    if (addAccountRowId) {
      if (addAccountSection === "bank") {
        updateBankRow(addAccountRowId, { accountId: newAcct.id });
      } else if (addAccountSection === "other") {
        const entryType: EntryType = newAcct.type === "LIABILITY" ? "CREDIT" : "DEBIT";
        updateOtherRow(addAccountRowId, { accountId: newAcct.id, entryType });
      }
    }
    setShowAddAccount(false);
    setAddAccountSection(null);
    setAddAccountRowId(null);
  }

  // ── Grid column templates ─────────────────────────────────────────────────────
  const BANK_COLS  = "1fr 160px 130px 1fr 32px";
  const OTHER_COLS = "1fr 160px 130px 90px 1fr 32px";

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout title="Opening Balances">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <AppLayout title="Opening Balances">
        <div className="max-w-xl mx-auto mt-20 text-center space-y-6">
          <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances Posted!</h2>
            <p className="text-muted-foreground mt-2">
              All bank account and fund balances have been updated. Your Dashboard is now accurate.
            </p>
          </div>
          {createdEntry && (
            <div className="rounded-xl border border-gray-200 p-4 text-sm text-left space-y-1">
              <div><span className="text-muted-foreground">Journal Entry ID:</span> <strong>{createdEntry.id?.slice(0, 8) ?? "—"}</strong></div>
              <div><span className="text-muted-foreground">Lines posted:</span> <strong>{createdEntry.linesCount ?? finalSubmitRows.length}</strong></div>
            </div>
          )}
          <div className="flex flex-col items-center gap-3 w-full">
            <Button
              variant="default"
              className="gap-2 bg-[hsl(210,60%,40%)] hover:bg-[hsl(210,60%,30%)] text-white w-full max-w-xs"
              disabled={syncing}
              onClick={handleSync}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Balances to Bank & Funds"}
            </Button>
            {syncResult && (
              <div className={`text-sm rounded-xl px-4 py-2 text-center w-full max-w-sm ${
                syncResult.startsWith("Error")
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-700"
              }`}>
                {syncResult}
              </div>
            )}
            <Button variant="outline" className="gap-2 w-full max-w-xs" onClick={() => { setPhase("wizard"); setCreatedEntry(null); load(); }}>
              <RotateCcw className="h-4 w-4" /> Edit Balances
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  return (
    <AppLayout title="Opening Balances">
      <div className="space-y-5 max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Enter starting balances by account and fund — fund balances are auto-calculated below.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            </label>
            <MethodToggle value={method} onChange={handleMethodChange} />
          </div>
        </div>

        {/* ── Date + existing-entry banner ── */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opening Balance Date</Label>
            <div className="relative mt-1">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className={cn("pl-8 w-44 h-9 text-sm", futureDateError && "border-red-400 focus:ring-red-400")}
                max={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
            {futureDateError && <p className="text-xs text-red-600 mt-1">Date cannot be in the future</p>}
          </div>
          {existingEntryId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Editing existing entry — saving will void and replace it.
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1 — Bank & Cash Accounts                                       */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-blue-200 overflow-hidden">
          {/* Section header */}
          <div className="bg-blue-600 px-5 py-3 flex items-center gap-2">
            <Landmark className="h-4 w-4 text-blue-100" />
            <span className="text-sm font-bold text-white">Bank &amp; Cash Accounts</span>
            <span className="ml-auto text-xs text-blue-200">Enter the current balance for each bank account and fund</span>
          </div>

          {/* Column headers */}
          <div
            className="grid gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-[10px] font-bold text-blue-700 uppercase tracking-wide"
            style={{ gridTemplateColumns: BANK_COLS }}
          >
            <span>Account</span>
            <span>Fund</span>
            <span>Balance ($)</span>
            <span>Memo</span>
            <span />
          </div>

          {/* Rows */}
          {bankRows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 px-4 py-2.5 border-b border-gray-100 items-center hover:bg-blue-50/20 transition-colors"
              style={{ gridTemplateColumns: BANK_COLS }}
            >
              <AccountCombobox
                accounts={assetCoa}
                value={row.accountId}
                onChange={(id) => updateBankRow(row.id, { accountId: id })}
                onAddNew={() => { setAddAccountSection("bank"); setAddAccountRowId(row.id); setShowAddAccount(true); }}
                placeholder="Bank/Cash account…"
              />
              <FundSelect funds={funds} value={row.fundId} onChange={(id) => updateBankRow(row.id, { fundId: id })} />
              <Input
                type="number" min="0" step="0.01"
                value={row.amount}
                onChange={(e) => updateBankRow(row.id, { amount: e.target.value })}
                placeholder="0.00"
                className="h-9 text-right font-mono text-sm"
              />
              <Input
                value={row.memo}
                onChange={(e) => updateBankRow(row.id, { memo: e.target.value })}
                placeholder="Memo (optional)"
                className="h-9 text-sm"
              />
              <button
                onClick={() => deleteBankRow(row.id)}
                disabled={bankRows.length <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add row */}
          <div className="px-4 py-3 bg-blue-50/30 border-t border-blue-100">
            <button
              onClick={addBankRow}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add bank account row
            </button>
          </div>

          {/* Section footer total */}
          <div className="px-5 py-2.5 bg-blue-50 border-t border-blue-200 flex justify-between items-center">
            <span className="text-xs text-blue-600">
              {activeBankRows.length} row{activeBankRows.length !== 1 ? "s" : ""} with balances
            </span>
            <span className="text-sm font-bold text-blue-800">
              Total Bank Assets: <span className="font-mono ml-2">{fmt(totalBankAssets)}</span>
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2 — Other Assets & Liabilities                                 */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-orange-200 overflow-hidden">
          {/* Section header */}
          <div className="bg-orange-500 px-5 py-3 flex items-center gap-2">
            <Scale className="h-4 w-4 text-orange-100" />
            <span className="text-sm font-bold text-white">Other Assets &amp; Liabilities</span>
            <span className="ml-auto text-xs text-orange-100">Receivables, equipment, payables, deferred revenue, etc.</span>
          </div>

          {/* Column headers */}
          <div
            className="grid gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100 text-[10px] font-bold text-orange-700 uppercase tracking-wide"
            style={{ gridTemplateColumns: OTHER_COLS }}
          >
            <span>Account</span>
            <span>Fund</span>
            <span>Amount ($)</span>
            <span>Type</span>
            <span>Memo</span>
            <span />
          </div>

          {/* Rows */}
          {otherRows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 px-4 py-2.5 border-b border-gray-100 items-center hover:bg-orange-50/10 transition-colors"
              style={{ gridTemplateColumns: OTHER_COLS }}
            >
              <AccountCombobox
                accounts={otherBsCoa}
                value={row.accountId}
                onChange={(id) => handleOtherAccountSelect(row.id, id)}
                onAddNew={() => { setAddAccountSection("other"); setAddAccountRowId(row.id); setShowAddAccount(true); }}
                placeholder="Asset or Liability…"
              />
              <FundSelect funds={funds} value={row.fundId} onChange={(id) => updateOtherRow(row.id, { fundId: id })} />
              <Input
                type="number" min="0" step="0.01"
                value={row.amount}
                onChange={(e) => updateOtherRow(row.id, { amount: e.target.value })}
                placeholder="0.00"
                className="h-9 text-right font-mono text-sm"
              />
              {/* Asset / Liability toggle — auto-derived from account type, manually overrideable */}
              <button
                onClick={() => updateOtherRow(row.id, { entryType: row.entryType === "DEBIT" ? "CREDIT" : "DEBIT" })}
                className={cn(
                  "h-8 px-2 rounded-lg text-xs font-bold border transition-colors",
                  row.entryType === "DEBIT"
                    ? "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200"
                    : "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200"
                )}
                title="Click to toggle Asset ↔ Liability"
              >
                {row.entryType === "DEBIT" ? "Asset" : "Liability"}
              </button>
              <Input
                value={row.memo}
                onChange={(e) => updateOtherRow(row.id, { memo: e.target.value })}
                placeholder="Memo (optional)"
                className="h-9 text-sm"
              />
              <button
                onClick={() => deleteOtherRow(row.id)}
                disabled={otherRows.length <= 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add row */}
          <div className="px-4 py-3 bg-orange-50/30 border-t border-orange-100">
            <button
              onClick={addOtherRow}
              className="flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-900 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add row
            </button>
          </div>

          {/* Section footer subtotals */}
          <div className="px-5 py-2.5 bg-orange-50 border-t border-orange-200 flex flex-wrap gap-6 justify-end">
            <span className="text-sm font-semibold text-blue-800">
              Other Assets: <span className="font-mono ml-1 font-bold">{fmt(totalOtherAssets)}</span>
            </span>
            <span className="text-sm font-semibold text-orange-800">
              Liabilities: <span className="font-mono ml-1 font-bold">{fmt(totalLiabilities)}</span>
            </span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3 — Fund Balances (auto-computed)                              */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-violet-200 overflow-hidden">
          {/* Section header */}
          <div className="bg-violet-600 px-5 py-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-100" />
            <span className="text-sm font-bold text-white">Fund Balances</span>
            <span className="ml-auto text-xs text-violet-200">Auto-calculated — Net Assets per fund (Assets − Liabilities)</span>
          </div>

          {fundBalances.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Enter bank/cash or asset amounts above to see auto-calculated fund balances here.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div
                className="grid gap-3 px-5 py-2 bg-violet-50 border-b border-violet-100 text-[10px] font-bold text-violet-700 uppercase tracking-wide"
                style={{ gridTemplateColumns: "1fr 1fr auto" }}
              >
                <span>Fund</span>
                <span>Net Assets Account (Equity)</span>
                <span className="text-right min-w-[130px]">Net Balance</span>
              </div>

              {fundBalances.map((fb) => {
                const fund = funds.find((f) => f.id === fb.fundId);
                return (
                  <div
                    key={fb.fundId}
                    className="grid gap-3 px-5 py-3 border-b border-gray-100 items-center"
                    style={{ gridTemplateColumns: "1fr 1fr auto" }}
                  >
                    {/* Fund name */}
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                      <span className="text-sm font-semibold">{fund?.name ?? "Unknown Fund"}</span>
                    </div>

                    {/* Equity account selector */}
                    <select
                      value={fb.equityAccountId}
                      onChange={(e) => setFundEquityMap((prev) => ({ ...prev, [fb.fundId]: e.target.value }))}
                      className={cn(
                        "h-8 px-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400",
                        !fb.equityAccountId ? "border-amber-300" : "border-gray-200"
                      )}
                    >
                      <option value="">— Select equity account —</option>
                      {equityCoa.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>

                    {/* Net amount */}
                    <div className={cn(
                      "text-right text-sm font-bold tabular-nums min-w-[130px]",
                      fb.netAmount >= 0 ? "text-violet-700" : "text-red-600"
                    )}>
                      {fmt(fb.netAmount)}
                    </div>
                  </div>
                );
              })}

              {/* Section total */}
              <div className="px-5 py-2.5 bg-violet-50 border-t border-violet-200 flex justify-between items-center">
                <span className="text-xs text-violet-600">
                  {fundBalances.length} fund{fundBalances.length !== 1 ? "s" : ""} with balances
                </span>
                <span className="text-sm font-bold text-violet-800">
                  Total Fund Balances: <span className="font-mono ml-2">{fmt(totalFundBalances)}</span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TOTALS FOOTER                                                           */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "rounded-xl border-2 px-6 py-5 transition-all",
          canPost ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"
        )}>
          {/* Accounting equation display */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Assets</div>
              <div className="text-xl font-bold tabular-nums text-blue-700">{fmt(totalAssets)}</div>
              <div className="text-[10px] text-blue-500 mt-0.5">Bank {fmt(totalBankAssets)} + Other {fmt(totalOtherAssets)}</div>
            </div>
            <div className="text-muted-foreground font-light text-xl">−</div>
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Liabilities</div>
              <div className="text-xl font-bold tabular-nums text-orange-700">{fmt(totalLiabilities)}</div>
            </div>
            <div className="text-muted-foreground font-light text-xl">=</div>
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Fund Balances</div>
              <div className="text-xl font-bold tabular-nums text-violet-700">{fmt(totalNetAssets)}</div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {canPost ? (
                <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Ready to post
                </span>
              ) : (
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Complete all rows
                </span>
              )}
              <Button
                onClick={() => { setError(""); setShowConfirm(true); }}
                disabled={!canPost}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
              >
                Review &amp; Post <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Validation hints */}
          {!canPost && hasData && (
            <ul className="space-y-0.5 border-t border-gray-200 pt-3">
              {futureDateError    && <li className="text-xs text-red-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> Date cannot be in the future</li>}
              {missingBankAcct    && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more bank rows is missing an account</li>}
              {missingBankFund    && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more bank rows is missing a fund</li>}
              {missingOtherAcct   && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more Other rows is missing an account</li>}
              {missingOtherFund   && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more Other rows is missing a fund</li>}
              {missingEquity      && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more funds is missing a Net Assets (equity) account</li>}
              {funds.length === 0 && <li className="text-xs text-red-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> No funds found — create at least one fund first</li>}
            </ul>
          )}
        </div>

        {/* ── Force Sync (shown only when an existing entry is posted) ── */}
        {existingEntryId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">Data Tools</p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-sm text-amber-800 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              Force Sync Bank Balances
            </button>
            {syncResult && <p className="mt-2 text-xs text-amber-700">{syncResult}</p>}
          </div>
        )}

      </div>

      {/* Modals */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleFinalize}
        saving={saving}
        error={error}
        submitRows={finalSubmitRows}
        allCoa={allCoa}
        funds={funds}
        asOfDate={asOfDate}
        method={method}
      />

      <AddAccountModal
        open={showAddAccount}
        onClose={() => { setShowAddAccount(false); setAddAccountSection(null); setAddAccountRowId(null); }}
        onCreated={handleAccountCreated}
      />
    </AppLayout>
  );
}
