import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Lock, RotateCcw,
  Info, Plus, Trash2, Layers, Calendar, X, ArrowLeftRight,
  Search, ChevronDown, Download, Upload, Wand2, ShieldCheck, ShieldAlert,
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
type Method = "CASH" | "ACCRUAL";
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

interface GridRow {
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

function defaultEntryType(acctType?: string): EntryType {
  if (acctType === "ASSET" || acctType === "EXPENSE") return "DEBIT";
  return "CREDIT";
}

function rowDebit(r: GridRow): number {
  const n = parseFloat(r.amount) || 0;
  if (n === 0) return 0;
  return r.entryType === "DEBIT" ? Math.abs(n) : 0;
}

function rowCredit(r: GridRow): number {
  const n = parseFloat(r.amount) || 0;
  if (n === 0) return 0;
  return r.entryType === "CREDIT" ? Math.abs(n) : 0;
}

const ACCT_TYPE_COLORS: Record<string, string> = {
  ASSET:     "bg-blue-100 text-blue-800",
  LIABILITY: "bg-orange-100 text-orange-800",
  EQUITY:    "bg-violet-100 text-violet-800",
  INCOME:    "bg-green-100 text-green-800",
  EXPENSE:   "bg-red-100 text-red-800",
};

// ── Account Combobox ──────────────────────────────────────────────────────────
function AccountCombobox({
  accounts,
  value,
  onChange,
  onAddNew,
}: {
  accounts: CoaAccount[];
  value: string;
  onChange: (id: string) => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = accounts.find((a) => a.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.slice(0, 40);
    const q = query.toLowerCase();
    return accounts
      .filter((a) =>
        a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayValue = open
    ? query
    : selected
    ? `${selected.code} — ${selected.linkedBankName ?? selected.name}`
    : "";

  return (
    <div ref={containerRef} className="relative w-full min-w-[220px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={displayValue}
          placeholder="Search account…"
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
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {filtered.map((a) => (
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
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0", ACCT_TYPE_COLORS[a.type] ?? "bg-gray-100 text-gray-600")}>
                {a.type}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No accounts match</div>
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

// ── DR/CR Toggle ──────────────────────────────────────────────────────────────
function DrCrToggle({ value, onChange }: { value: EntryType; onChange: (v: EntryType) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold shrink-0">
      <button
        onClick={() => onChange("DEBIT")}
        className={cn(
          "px-2.5 py-1.5 transition-colors",
          value === "DEBIT" ? "bg-blue-700 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
        )}
      >
        DR
      </button>
      <button
        onClick={() => onChange("CREDIT")}
        className={cn(
          "px-2.5 py-1.5 transition-colors",
          value === "CREDIT" ? "bg-emerald-700 text-white" : "bg-white text-gray-400 hover:bg-gray-50"
        )}
      >
        CR
      </button>
    </div>
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
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (account: CoaAccount) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"ASSET" | "LIABILITY" | "EQUITY">("ASSET");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode(""); setName(""); setType("ASSET"); setError("");
      setTimeout(() => nameRef.current?.focus(), 80);
    }
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
  open,
  onClose,
  onConfirm,
  saving,
  error,
  rows,
  allCoa,
  funds,
  asOfDate,
  method,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string;
  rows: GridRow[];
  allCoa: CoaAccount[];
  funds: FundRecord[];
  asOfDate: string;
  method: Method;
}) {
  const acctMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const fundMap = Object.fromEntries(funds.map((f) => [f.id, f]));
  const active = rows.filter((r) => parseFloat(r.amount) > 0 && r.accountId && r.fundId);
  const totalDebits = active.reduce((s, r) => s + rowDebit(r), 0);
  const totalCredits = active.reduce((s, r) => s + rowCredit(r), 0);

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
            <div><span className="text-muted-foreground">Lines:</span> <strong>{active.length}</strong></div>
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
                {active.map((row) => {
                  const acct = acctMap[row.accountId];
                  const fund = fundMap[row.fundId];
                  const debit = rowDebit(row);
                  const credit = rowCredit(row);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{acct?.code}</span>
                        <span className="font-medium">{acct?.linkedBankName ?? acct?.name ?? "—"}</span>
                        {row.memo && <div className="text-xs text-muted-foreground mt-0.5 italic">{row.memo}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fund?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">
                        {debit > 0 ? fmt(debit) : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                        {credit > 0 ? fmt(credit) : ""}
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
            This will post journal entry <strong>{active.length} lines</strong> to the General Ledger with
            source type <code className="bg-blue-100 px-1 rounded text-xs">OPENING_BALANCE</code>.
            Any existing opening balance entry will be voided and replaced.
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountTargetRowId, setAddAccountTargetRowId] = useState<string | null>(null);

  const [allCoa, setAllCoa]   = useState<CoaAccount[]>([]);
  const [funds, setFunds]     = useState<FundRecord[]>([]);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [createdEntry, setCreatedEntry] = useState<any | null>(null);
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState<string | null>(null);

  const [rows, setRows] = useState<GridRow[]>([]);

  // ── Load ────────────────────────────────────────────────────────────────────
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
        const reconstructed: GridRow[] = data.existingRows.map((r: any) => ({
          id: uid(),
          accountId: r.accountId ?? "",
          fundId: r.fundId ?? firstFundId,
          amount: String(r.amount ?? ""),
          entryType: r.entryType ?? "DEBIT",
          memo: r.memo ?? "",
        }));
        setRows(reconstructed);
      } else {
        setRows([
          { id: uid(), accountId: "", fundId: firstFundId, amount: "", entryType: "DEBIT", memo: "" },
          { id: uid(), accountId: "", fundId: firstFundId, amount: "", entryType: "CREDIT", memo: "" },
        ]);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Row Operations ──────────────────────────────────────────────────────────
  function makeNewRow(): GridRow {
    return { id: uid(), accountId: "", fundId: defaultFundId, amount: "", entryType: "DEBIT", memo: "" };
  }

  function addRow() { setRows((prev) => [...prev, makeNewRow()]); }
  function deleteRow(id: string) { setRows((prev) => { if (prev.length <= 2) return prev; return prev.filter((r) => r.id !== id); }); }

  function updateRow(id: string, patch: Partial<Omit<GridRow, "id">>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function handleAccountSelect(rowId: string, accountId: string) {
    const acct = allCoa.find((a) => a.id === accountId);
    const entryType = defaultEntryType(acct?.type);
    updateRow(rowId, { accountId, entryType });
  }

  function handleAmountChange(rowId: string, val: string) {
    updateRow(rowId, { amount: val });
  }

  function handleAmountBlur(rowId: string, val: string) {
    const n = parseFloat(val);
    if (!isNaN(n) && n < 0) {
      setRows((prev) => prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, amount: String(Math.abs(n)), entryType: r.entryType === "DEBIT" ? "CREDIT" : "DEBIT" };
      }));
    }
  }

  function handleAddNew(rowId: string) {
    setAddAccountTargetRowId(rowId);
    setShowAddAccount(true);
  }

  function handleAccountCreated(newAcct: CoaAccount) {
    setAllCoa((prev) => [...prev, newAcct]);
    if (addAccountTargetRowId) {
      handleAccountSelect(addAccountTargetRowId, newAcct.id);
    }
    setShowAddAccount(false);
    setAddAccountTargetRowId(null);
  }

  // ── Accounting method change ─────────────────────────────────────────────────
  async function handleMethodChange(m: Method) {
    setMethod(m);
    await api(`${BASE}api/opening-balance/method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingMethod: m }),
    });
  }

  // ── Computed totals ──────────────────────────────────────────────────────────
  const totalDebits  = useMemo(() => rows.reduce((s, r) => s + rowDebit(r), 0), [rows]);
  const totalCredits = useMemo(() => rows.reduce((s, r) => s + rowCredit(r), 0), [rows]);
  const outOfBalance = Math.abs(totalDebits - totalCredits);
  const isBalanced   = outOfBalance < 0.01 && totalDebits > 0;

  const futureDateError = asOfDate > format(new Date(), "yyyy-MM-dd");
  const activeRows      = rows.filter((r) => parseFloat(r.amount) > 0);
  const missingAccount  = activeRows.some((r) => !r.accountId);
  const missingFund     = activeRows.some((r) => !r.fundId);
  const hasData         = activeRows.length >= 2;

  // ── Accounting equation (needs to be above canPost) ───────────────────────
  const eqAssets = useMemo(() =>
    rows.reduce((s, r) => {
      const acct = allCoa.find((a) => a.id === r.accountId);
      if (acct?.type !== "ASSET") return s;
      return s + rowDebit(r) - rowCredit(r);
    }, 0), [rows, allCoa]);

  const eqLiabilities = useMemo(() =>
    rows.reduce((s, r) => {
      const acct = allCoa.find((a) => a.id === r.accountId);
      if (acct?.type !== "LIABILITY") return s;
      return s + rowCredit(r) - rowDebit(r);
    }, 0), [rows, allCoa]);

  const eqNetAssets = useMemo(() =>
    rows.reduce((s, r) => {
      const acct = allCoa.find((a) => a.id === r.accountId);
      if (acct?.type !== "EQUITY") return s;
      return s + rowCredit(r) - rowDebit(r);
    }, 0), [rows, allCoa]);

  const equityGap = eqAssets - eqLiabilities - eqNetAssets;
  const accountingEquationOk = Math.abs(equityGap) < 0.01;

  const hasIncomeExpenseAccounts = activeRows.some((r) => {
    const acct = allCoa.find((a) => a.id === r.accountId);
    return acct && (acct.type === "INCOME" || acct.type === "EXPENSE");
  });

  const canPost = isBalanced && hasData && !futureDateError && !missingAccount && !missingFund && !hasIncomeExpenseAccounts && accountingEquationOk;

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      const submitRows = rows
        .filter((r) => parseFloat(r.amount) > 0 && r.accountId && r.fundId)
        .map((r) => ({
          accountId: r.accountId,
          fundId: r.fundId,
          amount: Math.abs(parseFloat(r.amount)),
          entryType: r.entryType,
          memo: r.memo || null,
        }));

      const res = await api(`${BASE}api/opening-balance/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: asOfDate, accountingMethod: method, rows: submitRows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save opening balance"); return; }
      setCreatedEntry(data);
      setShowConfirm(false);
      setPhase("done");
    } finally { setSaving(false); }
  }

  // ── Force sync existing OB balances ─────────────────────────────────────────
  async function handleSync() {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await api(`${BASE}api/opening-balance/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setSyncResult(`Error: ${data.error ?? "Sync failed"}`); return; }
      const updatedCount = data.bankBalancesUpdated?.length ?? 0;
      const txCount = data.transactionsCreated?.length ?? 0;
      setSyncResult(`Sync complete — ${updatedCount} bank balance(s) updated, ${txCount} bank register transaction(s) created.`);
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // ── Sorted COA (must be before any early returns — Rules of Hooks) ──────────
  const sortedCoa = useMemo(() =>
    [...allCoa].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [allCoa]
  );

  // ── Balance-sheet-only filter (GAAP: OB uses Assets, Liabilities, Equity) ──
  const balanceSheetCoa = useMemo(
    () => sortedCoa.filter((a) => ["ASSET", "LIABILITY", "EQUITY"].includes(a.type ?? "")),
    [sortedCoa]
  );

  // ── Auto-calculate net asset offset ─────────────────────────────────────────
  function handleAutoNetAssets() {
    const equityAccounts = balanceSheetCoa.filter((a) => a.type === "EQUITY");
    if (!equityAccounts.length) return;

    const required = eqAssets - eqLiabilities; // what net assets should be
    const entryType: EntryType = required >= 0 ? "CREDIT" : "DEBIT";
    const amount = String(Math.abs(required).toFixed(2));
    const targetFundId = defaultFundId || funds[0]?.id || "";

    const existingEquityRow = rows.find((r) => {
      const acct = allCoa.find((a) => a.id === r.accountId);
      return acct?.type === "EQUITY";
    });

    if (existingEquityRow) {
      updateRow(existingEquityRow.id, {
        amount,
        entryType,
        memo: existingEquityRow.memo || "Net Assets (auto-calculated)",
      });
    } else {
      const equityAcct = equityAccounts[0];
      setRows((prev) => [
        ...prev,
        {
          id: uid(),
          accountId: equityAcct.id,
          fundId: targetFundId,
          amount,
          entryType,
          memo: "Net Assets (auto-calculated)",
        },
      ]);
    }
  }

  // ── CSV template download ─────────────────────────────────────────────────────
  function downloadTemplate() {
    const header = ["Account Code", "Account Name", "Account Type", "Fund Name", "Amount", "DR/CR", "Memo"];
    const examples = [
      ["1010", "Checking Account", "ASSET", "General Fund", "50000.00", "DR", "Opening bank balance"],
      ["1020", "Savings Account", "ASSET", "Restricted Fund", "10000.00", "DR", "Restricted cash"],
      ["2010", "Accounts Payable", "LIABILITY", "General Fund", "5000.00", "CR", "Amount owed to vendors"],
      ["3010", "Net Assets - Unrestricted", "EQUITY", "General Fund", "45000.00", "CR", "Opening net assets"],
      ["3020", "Net Assets - Restricted", "EQUITY", "Restricted Fund", "10000.00", "CR", "Restricted net assets"],
    ];
    const csv = [header, ...examples].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opening-balance-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV import ────────────────────────────────────────────────────────────────
  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-import of the same file
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;

      const parseCsv = (line: string) =>
        line.split(",").map((c) => c.trim().replace(/^"|"$/g, "").trim());

      const header = parseCsv(lines[0]).map((h) => h.toLowerCase());
      const codeIdx  = header.findIndex((h) => h.includes("account code"));
      const fundIdx  = header.findIndex((h) => h.includes("fund"));
      const amtIdx   = header.findIndex((h) => h.includes("amount"));
      const drcrIdx  = header.findIndex((h) => h.includes("dr") || h.includes("type"));
      const memoIdx  = header.findIndex((h) => h.includes("memo"));

      const newRows: GridRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsv(lines[i]);
        if (!cols[codeIdx]) continue;
        const acct = allCoa.find((a) => a.code === cols[codeIdx]);
        const fundName = (cols[fundIdx] ?? "").toLowerCase();
        const fund = funds.find((f) => f.name.toLowerCase() === fundName);
        const drcrRaw = (cols[drcrIdx] ?? "DR").toUpperCase().trim();
        const entryType: EntryType = drcrRaw === "CR" || drcrRaw === "CREDIT" ? "CREDIT" : "DEBIT";
        newRows.push({
          id: uid(),
          accountId: acct?.id ?? "",
          fundId: fund?.id ?? defaultFundId ?? "",
          amount: cols[amtIdx] ?? "",
          entryType,
          memo: cols[memoIdx] ?? "",
        });
      }
      if (newRows.length > 0) setRows(newRows);
    };
    reader.readAsText(file);
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-40" />
        </div>
      </AppLayout>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (phase === "done" && createdEntry) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="max-w-lg mx-auto py-10 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances Posted!</h2>
            <p className="text-muted-foreground mt-1">
              Journal Entry <strong>{createdEntry.entryNumber}</strong> has been posted to the General Ledger as of{" "}
              <strong>{format(new Date(asOfDate), "MMMM d, yyyy")}</strong>.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-left space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Debits</span>
              <span className="font-bold text-blue-700">{fmt(createdEntry.totalDebits)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Credits</span>
              <span className="font-bold text-emerald-700">{fmt(createdEntry.totalCredits)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Lines Posted</span>
              <span className="font-semibold">{createdEntry.lineCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Accounting Method</span>
              <span className="font-semibold">{method === "CASH" ? "Cash Basis" : "Accrual Basis"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Source Type</span>
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">OPENING_BALANCE</code>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Lock className="h-4 w-4 shrink-0" />
            {createdEntry.entryNumber} is posted and locked in the General Ledger
          </div>
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

  // ── Wizard ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout title="Opening Balance Wizard">
      <div className="space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balance Wizard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              GAAP-compliant opening balances — balance sheet accounts only (Assets, Liabilities, Net Assets).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* CSV download template */}
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              title="Download CSV import template"
            >
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            {/* CSV import */}
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer" title="Import from CSV">
              <Upload className="h-3.5 w-3.5" /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            </label>
            <MethodToggle value={method} onChange={handleMethodChange} />
          </div>
        </div>

        {/* Date + Default Fund row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <div className={cn(
            "flex items-center gap-4 p-4 rounded-xl border-2 transition-colors",
            futureDateError ? "border-red-300 bg-red-50" : "border-[hsl(210,60%,82%)] bg-[hsl(210,60%,97%)]"
          )}>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", futureDateError ? "bg-red-100" : "bg-[hsl(210,60%,90%)]")}>
              <Calendar className={cn("h-5 w-5", futureDateError ? "text-red-500" : "text-[hsl(210,60%,35%)]")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opening Balance Date</p>
              <input
                type="date"
                value={asOfDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setAsOfDate(e.target.value)}
                className={cn(
                  "mt-1 h-9 px-3 w-full rounded-lg border-2 text-sm font-semibold focus:outline-none bg-white",
                  futureDateError ? "border-red-400 text-red-700" : "border-[hsl(210,60%,70%)] text-[hsl(210,60%,20%)]"
                )}
              />
              {futureDateError && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Date cannot be in the future</p>}
              {!futureDateError && asOfDate && <p className="text-xs text-[hsl(210,60%,40%)] mt-1 font-medium">{format(new Date(asOfDate), "EEEE, MMMM d, yyyy")}</p>}
            </div>
          </div>

          {/* Default Fund */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-violet-100 bg-violet-50">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5 text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Default Fund</p>
              <p className="text-[11px] text-violet-600 mb-1">Applied to new rows (override per row)</p>
              {funds.length > 0 ? (
                <select
                  value={defaultFundId}
                  onChange={(e) => setDefaultFundId(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-violet-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-violet-900"
                >
                  <option value="">— No default —</option>
                  {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              ) : (
                <p className="text-xs text-amber-700 font-medium">No funds found — create one in Funds first.</p>
              )}
            </div>
          </div>
        </div>

        {/* Warnings */}
        {funds.length === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>No funds found.</strong> Please create at least one Fund (e.g., "General Fund") in the Funds module before setting opening balances.</span>
          </div>
        )}
        {existingEntryId && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <Info className="h-4 w-4 shrink-0" />
            An existing opening balance entry is already posted. Saving new balances will void and replace it.
          </div>
        )}

        {/* Instruction banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50 text-sm text-blue-800">
          <ArrowLeftRight className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <strong>GAAP double-entry opening balances:</strong> Only <strong>balance sheet accounts</strong> are permitted
            (Assets, Liabilities, Net Assets / Equity). Revenue and expense accounts are blocked.
            Assets start with <strong>DR</strong>; Liabilities and Net Assets start with <strong>CR</strong>.
            The accounting equation <strong>Assets = Liabilities + Net Assets</strong> must hold.
            Use <strong>"Auto-calculate Net Assets"</strong> to auto-fill the equity offset, then post.
          </div>
        </div>

        {/* ── The Grid ─────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {/* Column headers */}
          <div className="grid gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
            style={{ gridTemplateColumns: "1fr 160px 120px 70px 140px 36px" }}>
            <div>Account</div>
            <div>Fund</div>
            <div className="text-right">Balance</div>
            <div className="text-center">Type</div>
            <div>Memo</div>
            <div />
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const acct = allCoa.find((a) => a.id === row.accountId);
              const hasAmount = parseFloat(row.amount) > 0;
              const rowValid  = row.accountId && row.fundId && hasAmount;

              return (
                <div
                  key={row.id}
                  className={cn(
                    "grid gap-2 px-4 py-2 items-center transition-colors",
                    !rowValid && hasAmount ? "bg-amber-50/40" : "hover:bg-gray-50/50"
                  )}
                  style={{ gridTemplateColumns: "1fr 160px 120px 70px 140px 36px" }}
                >
                  {/* Account — balance sheet only (ASSET/LIABILITY/EQUITY) */}
                  <AccountCombobox
                    accounts={balanceSheetCoa}
                    value={row.accountId}
                    onChange={(id) => handleAccountSelect(row.id, id)}
                    onAddNew={() => handleAddNew(row.id)}
                  />

                  {/* Fund */}
                  <select
                    value={row.fundId}
                    onChange={(e) => updateRow(row.id, { fundId: e.target.value })}
                    className={cn(
                      "h-9 w-full px-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)]",
                      !row.fundId ? "border-amber-300" : "border-gray-200"
                    )}
                  >
                    <option value="">— Fund —</option>
                    {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>

                  {/* Balance */}
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => handleAmountChange(row.id, e.target.value)}
                    onBlur={(e) => handleAmountBlur(row.id, e.target.value)}
                    placeholder="0.00"
                    className={cn(
                      "h-9 w-full px-2 text-right text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)] tabular-nums font-mono",
                      "border-gray-200",
                      row.entryType === "DEBIT" && hasAmount ? "text-blue-700 font-semibold" : "",
                      row.entryType === "CREDIT" && hasAmount ? "text-emerald-700 font-semibold" : ""
                    )}
                  />

                  {/* DR/CR Toggle */}
                  <div className="flex justify-center">
                    <DrCrToggle value={row.entryType} onChange={(v) => updateRow(row.id, { entryType: v })} />
                  </div>

                  {/* Memo */}
                  <input
                    type="text"
                    value={row.memo}
                    onChange={(e) => updateRow(row.id, { memo: e.target.value })}
                    placeholder="Note…"
                    className="h-9 w-full px-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)]"
                  />

                  {/* Delete */}
                  <button
                    onClick={() => deleteRow(row.id)}
                    disabled={rows.length <= 2}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add row */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm font-medium text-[hsl(210,60%,35%)] hover:text-[hsl(210,60%,20%)] transition-colors"
            >
              <Plus className="h-4 w-4" /> Add row
            </button>
          </div>
        </div>

        {/* ── Validation Checklist ─────────────────────────────────────────────── */}
        {activeRows.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Validation Checklist</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { ok: !hasIncomeExpenseAccounts, label: "Balance sheet accounts only" },
                { ok: !missingAccount,           label: "All rows have an account" },
                { ok: !missingFund,              label: "All rows have a fund" },
                { ok: isBalanced,                label: "Total Debits = Total Credits" },
                { ok: accountingEquationOk,      label: "Assets = Liabilities + Net Assets" },
                { ok: !futureDateError,          label: "Valid opening date" },
              ].map(({ ok, label }) => (
                <div key={label} className={cn(
                  "flex items-center gap-2 text-xs px-3 py-2 rounded-lg border",
                  ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                )}>
                  {ok
                    ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    : <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  }
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Accounting Equation Panel ─────────────────────────────────────────── */}
        {(eqAssets > 0 || eqLiabilities > 0 || eqNetAssets > 0) && (
          <div className={cn(
            "rounded-xl border-2 px-5 py-4 transition-colors",
            accountingEquationOk ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"
          )}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Statement of Financial Position (Accounting Equation)</p>
            <div className="flex flex-wrap items-center gap-3 justify-center">
              {/* Assets */}
              <div className="text-center min-w-[120px]">
                <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Total Assets</p>
                <p className="text-xl font-bold tabular-nums text-blue-700 mt-0.5">{fmt(eqAssets)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Debit-normal</p>
              </div>
              <span className="text-2xl text-muted-foreground font-light">=</span>
              {/* Liabilities */}
              <div className="text-center min-w-[120px]">
                <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wide">Total Liabilities</p>
                <p className="text-xl font-bold tabular-nums text-orange-700 mt-0.5">{fmt(eqLiabilities)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Credit-normal</p>
              </div>
              <span className="text-2xl text-muted-foreground font-light">+</span>
              {/* Net Assets */}
              <div className="text-center min-w-[120px]">
                <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-wide">Net Assets</p>
                <p className="text-xl font-bold tabular-nums text-violet-700 mt-0.5">{fmt(eqNetAssets)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Credit-normal</p>
              </div>
              {/* Gap / Status */}
              {!accountingEquationOk && eqAssets > 0 && (
                <div className="flex flex-col items-center gap-2 ml-4">
                  <p className="text-xs text-amber-700 font-semibold">
                    Gap: {fmt(Math.abs(equityGap))} — net assets {equityGap > 0 ? "under" : "over"}stated
                  </p>
                  <button
                    onClick={handleAutoNetAssets}
                    disabled={balanceSheetCoa.filter(a => a.type === "EQUITY").length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                    title={balanceSheetCoa.filter(a => a.type === "EQUITY").length === 0 ? "Add an equity/net assets account first" : ""}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Auto-calculate Net Assets
                  </button>
                </div>
              )}
              {accountingEquationOk && eqAssets > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold ml-2">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Equation balanced
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Balance Footer ────────────────────────────────────────────────────── */}
        <div className={cn(
          "rounded-xl border-2 px-6 py-4 transition-all",
          isBalanced
            ? "border-emerald-200 bg-emerald-50"
            : outOfBalance > 0
            ? "border-red-200 bg-red-50"
            : "border-gray-200 bg-gray-50"
        )}>
          <div className="flex flex-wrap items-center gap-6 justify-between">
            {/* Totals */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Debits</div>
                <div className="text-lg font-bold tabular-nums text-blue-700">{fmt(totalDebits)}</div>
              </div>
              <div className="text-muted-foreground font-light text-xl">=</div>
              <div className="text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Credits</div>
                <div className="text-lg font-bold tabular-nums text-emerald-700">{fmt(totalCredits)}</div>
              </div>
              <div className="text-muted-foreground font-light text-xl">|</div>
              <div className="text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Out of Balance</div>
                <div className={cn(
                  "text-lg font-bold tabular-nums",
                  isBalanced ? "text-emerald-700" : outOfBalance > 0 ? "text-red-700" : "text-muted-foreground"
                )}>
                  {isBalanced ? "✓ $0.00" : outOfBalance > 0 ? fmt(outOfBalance) : "$0.00"}
                </div>
              </div>
            </div>

            {/* Status + Post button */}
            <div className="flex items-center gap-4">
              {isBalanced ? (
                <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Balanced — ready to post
                </span>
              ) : outOfBalance > 0 ? (
                <span className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Out of balance by {fmt(outOfBalance)}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Enter debits and credits to check balance</span>
              )}

              <Button
                onClick={() => { setError(""); setShowConfirm(true); }}
                disabled={!canPost || funds.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
              >
                Review & Post <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Validation hints */}
          {(!canPost && activeRows.length > 0) && (
            <ul className="mt-3 space-y-0.5 border-t border-gray-200 pt-3">
              {futureDateError && (
                <li className="text-xs text-red-700 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> Opening balance date cannot be in the future
                </li>
              )}
              {hasIncomeExpenseAccounts && (
                <li className="text-xs text-red-700 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> Revenue/expense accounts are not allowed — remove them and use balance sheet accounts only
                </li>
              )}
              {missingAccount && (
                <li className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more rows is missing an account
                </li>
              )}
              {missingFund && (
                <li className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more rows is missing a fund
                </li>
              )}
              {isBalanced && !accountingEquationOk && (
                <li className="text-xs text-amber-700 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> Debits = Credits but Assets ≠ Liabilities + Net Assets — use "Auto-calculate Net Assets" to fix
                </li>
              )}
            </ul>
          )}
        </div>

      </div>

      {/* Modals */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleFinalize}
        saving={saving}
        error={error}
        rows={rows}
        allCoa={allCoa}
        funds={funds}
        asOfDate={asOfDate}
        method={method}
      />

      <AddAccountModal
        open={showAddAccount}
        onClose={() => { setShowAddAccount(false); setAddAccountTargetRowId(null); }}
        onCreated={handleAccountCreated}
      />
    </AppLayout>
  );
}
