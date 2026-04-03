import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Lock, RotateCcw,
  Info, Plus, Trash2, Layers, Calendar, X, ArrowLeftRight,
  Search, ChevronDown, Download, Upload, Landmark, Scale, TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";

const BASE = import.meta.env.BASE_URL;

/** Same-origin or `VITE_API_BASE_URL`, with bearer token — matches Bank Register / Funds API calls. */
function api(path: string, init?: RequestInit): Promise<Response> {
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
}

interface FundRecord {
  id: string;
  name: string;
  fundType?: string; // UNRESTRICTED | RESTRICTED_TEMP | RESTRICTED_PERM | ...
}

// Asset row (always DEBIT)
interface AssetRow {
  id: string;
  accountId: string;
  fundId: string;
  amount: string;
  memo: string;
}

// Liability row (always CREDIT)
interface LiabilityRow {
  id: string;
  accountId: string;
  fundId: string;
  amount: string;
  memo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const uid = () => crypto.randomUUID();

// Auto-pick a default equity account for a fund based on its type
function defaultEquityAccount(fundType: string | undefined, equityCoa: CoaAccount[]): string {
  if (!equityCoa.length) return "";
  const type = (fundType ?? "").toUpperCase();

  if (type === "UNRESTRICTED") {
    const match =
      equityCoa.find((a) => /unrestricted/i.test(a.name)) ??
      equityCoa.find((a) => /^3[12]/.test(a.code));
    return match?.id ?? equityCoa[0].id;
  }
  if (type === "RESTRICTED_TEMP" || type === "TEMPORARILY_RESTRICTED") {
    const match =
      equityCoa.find((a) => /temporar|restricted/i.test(a.name)) ??
      equityCoa.find((a) => /^32/.test(a.code));
    return match?.id ?? equityCoa[0].id;
  }
  if (type === "RESTRICTED_PERM" || type === "PERMANENTLY_RESTRICTED") {
    const match =
      equityCoa.find((a) => /permanentl|restricted/i.test(a.name)) ??
      equityCoa.find((a) => /^33/.test(a.code));
    return match?.id ?? equityCoa[0].id;
  }
  return equityCoa[0].id;
}

// ── Account Combobox ──────────────────────────────────────────────────────────
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

  const selected = accounts.find((a) => a.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.slice(0, 80);
    const q = query.toLowerCase();
    return accounts
      .filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const display = open
    ? query
    : selected
    ? `${selected.code} — ${selected.linkedBankName ?? selected.name}`
    : "";

  return (
    <div ref={containerRef} className="relative w-full min-w-[180px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={display}
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

// ── Equity Combobox — mirrors AccountCombobox exactly (no readOnly, touch-safe) ─
function EquityCombobox({
  accounts, value, onChange,
}: {
  accounts: CoaAccount[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen]   = useState(false);
  const containerRef      = useRef<HTMLDivElement>(null);

  const selected = accounts.find((a) => a.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.slice(0, 50);
    const q = query.toLowerCase();
    return accounts.filter(
      (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Identical display logic to AccountCombobox — NO readOnly attribute
  const display = open
    ? query
    : selected
    ? `${selected.code} — ${selected.name}`
    : "";

  return (
    <div ref={containerRef} className="relative w-full min-w-[180px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={display}
          placeholder="Search equity account…"
          className={cn(
            "w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500",
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
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {accounts.length === 0 ? (
            <div className="px-3 py-4 text-center space-y-1">
              <p className="text-sm text-muted-foreground">No equity accounts in your Chart of Accounts.</p>
              <a
                href={`${BASE}chart-of-accounts`}
                className="text-sm font-semibold text-emerald-700 hover:underline"
                onMouseDown={(e) => e.stopPropagation()}
              >
                + Add equity accounts →
              </a>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No accounts match</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center gap-2 transition-colors",
                  a.id === value && "bg-emerald-50"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(a.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{a.code}</span>
                <span className="flex-1 truncate">{a.name}</span>
              </button>
            ))
          )}
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
  open, onClose, onCreated, defaultType = "ASSET",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: CoaAccount) => void;
  defaultType?: "ASSET" | "LIABILITY" | "EQUITY";
}) {
  const [code, setCode]     = useState("");
  const [name, setName]     = useState("");
  const [type, setType]     = useState<"ASSET" | "LIABILITY" | "EQUITY">(defaultType);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setCode(""); setName(""); setType(defaultType); setError(""); setTimeout(() => nameRef.current?.focus(), 80); }
  }, [open, defaultType]);

  async function handleSave() {
    setError("");
    if (!code.trim()) { setError("Account code is required."); return; }
    if (!name.trim()) { setError("Account name is required."); return; }
    setSaving(true);
    try {
      const res = await api("/api/chart-of-accounts", {
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
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</Label>
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
  open, onClose, onConfirm, saving, error,
  submitRows, allCoa, funds, asOfDate, method,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  saving: boolean; error: string;
  submitRows: Array<{ accountId: string; fundId: string; amount: number; entryType: EntryType; memo: string | null }>;
  allCoa: CoaAccount[]; funds: FundRecord[]; asOfDate: string; method: Method;
}) {
  const acctMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
  const fundMap = Object.fromEntries(funds.map((f) => [f.id, f]));
  const totalDR = submitRows.filter((r) => r.entryType === "DEBIT").reduce((s, r) => s + r.amount, 0);
  const totalCR = submitRows.filter((r) => r.entryType === "CREDIT").reduce((s, r) => s + r.amount, 0);

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
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Account</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Fund</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase w-28">Debit</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase w-28">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {submitRows.map((row, i) => {
                  const acct = acctMap[row.accountId];
                  const fund = fundMap[row.fundId];
                  return (
                    <tr key={i} className="hover:bg-gray-50/50">
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
                  <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{fmt(totalDR)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{fmt(totalCR)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
            <Info className="h-4 w-4 shrink-0" />
            Posts <strong>{submitRows.length} lines</strong> to the GL. Any existing opening balance entry will be voided and replaced.
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

// ── Ledger Row (shared for Asset + Liability sections) ─────────────────────────
function LedgerRowInput({
  row, funds, accounts, onUpdate, onDelete, canDelete, onAddNew, placeholder,
}: {
  row: AssetRow | LiabilityRow;
  funds: FundRecord[];
  accounts: CoaAccount[];
  onUpdate: (patch: Partial<AssetRow>) => void;
  onDelete: () => void;
  canDelete: boolean;
  onAddNew: () => void;
  placeholder: string;
}) {
  const COLS = "1fr 160px 130px 1fr 32px";
  return (
    <div
      className="grid gap-2 px-4 py-2.5 border-b border-gray-100 items-center transition-colors"
      style={{ gridTemplateColumns: COLS }}
    >
      <AccountCombobox
        accounts={accounts}
        value={row.accountId}
        onChange={(id) => onUpdate({ accountId: id })}
        onAddNew={onAddNew}
        placeholder={placeholder}
      />
      <FundSelect funds={funds} value={row.fundId} onChange={(id) => onUpdate({ fundId: id })} />
      <Input
        type="number" min="0" step="0.01"
        value={row.amount}
        onChange={(e) => onUpdate({ amount: e.target.value })}
        placeholder="0.00"
        className="h-9 text-right font-mono text-sm"
      />
      <Input
        value={row.memo}
        onChange={(e) => onUpdate({ memo: e.target.value })}
        placeholder="Memo (optional)"
        className="h-9 text-sm"
      />
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Section Shell ─────────────────────────────────────────────────────────────
function SectionShell({
  icon, title, subtitle, headerCls, headerTextCls, footerCls, footerContent, addLabel, onAdd, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  headerCls: string; headerTextCls: string; footerCls: string;
  footerContent: React.ReactNode; addLabel?: string; onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl overflow-hidden", headerCls.replace(/bg-\S+/, "border-2").replace(/text-\S+/, "").replace(/px-\S+/, "").replace(/py-\S+/, "").trim(), "border-2")}>
      <div className={cn(headerCls, "px-5 py-3 flex items-center gap-2")}>
        {icon}
        <span className="text-sm font-bold text-white">{title}</span>
        <span className={cn("ml-auto text-xs", headerTextCls)}>{subtitle}</span>
      </div>
      {children}
      {onAdd && addLabel && (
        <div className="px-4 py-3">
          <button
            onClick={onAdd}
            className={cn("flex items-center gap-1.5 text-sm font-medium transition-colors", headerTextCls)}
          >
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
        </div>
      )}
      <div className={cn(footerCls, "px-5 py-2.5 flex justify-between items-center")}>
        {footerContent}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OpeningBalancePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase]       = useState<"wizard" | "done">("wizard");
  const [method, setMethod]     = useState<Method>("CASH");
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [defaultFundId, setDefaultFundId] = useState("");
  const [showConfirm, setShowConfirm]     = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountType, setAddAccountType] = useState<"ASSET" | "LIABILITY" | "EQUITY">("ASSET");
  const [addAccountSection, setAddAccountSection] = useState<"asset" | "liability" | null>(null);
  const [addAccountRowId, setAddAccountRowId]   = useState<string | null>(null);
  const [existingEntryId, setExistingEntryId]   = useState<string | null>(null);
  const [createdEntry, setCreatedEntry]         = useState<any | null>(null);
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [allCoa, setAllCoa] = useState<CoaAccount[]>([]);
  const [funds, setFunds]   = useState<FundRecord[]>([]);

  // Four sections of state
  const [assetRows,     setAssetRows]     = useState<AssetRow[]>([]);
  const [liabilityRows, setLiabilityRows] = useState<LiabilityRow[]>([]);
  // Per-fund equity account: fundId → equityAccountId
  const [fundEquityMap, setFundEquityMap] = useState<Record<string, string>>({});
  // Per-fund directly-entered balance (string so we don't lose trailing decimals while typing)
  const [directFundAmounts, setDirectFundAmounts] = useState<Record<string, string>>({});

  // ── Load ─────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setLoadError("");
    try {
      const res = await api("/api/opening-balance");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : `Could not load opening balance (${res.status}). Check API URL (VITE_API_BASE_URL) and sign-in.`,
        );
        return;
      }

      setMethod(data.accountingMethod ?? "CASH");
      setAllCoa(data.coa ?? []);
      setFunds(data.funds ?? []);
      setExistingEntryId(data.openingBalanceEntryId ?? null);
      if (data.openingBalanceDate) setAsOfDate(data.openingBalanceDate.slice(0, 10));

      const fds: FundRecord[]       = data.funds ?? [];
      const coa: CoaAccount[]       = data.coa ?? [];
      const firstFundId             = fds[0]?.id ?? "";
      if (firstFundId) setDefaultFundId(firstFundId);

      const eq = coa.filter((a) => a.type === "EQUITY")
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

      // Build default fund→equity map from fund types
      const defaultMap: Record<string, string> = {};
      for (const f of fds) {
        defaultMap[f.id] = defaultEquityAccount(f.fundType, eq);
      }

      if (data.existingRows?.length) {
        const coaMap: Record<string, CoaAccount> = Object.fromEntries(coa.map((a) => [a.id, a]));
        const newAsset: AssetRow[]       = [];
        const newLiab: LiabilityRow[]    = [];
        const rebuiltEquityMap: Record<string, string> = { ...defaultMap };
        const rebuiltDirectAmounts: Record<string, string> = {};

        for (const r of data.existingRows) {
          const acct = coaMap[r.accountId];
          if (!acct) continue;
          const fid = r.fundId ?? firstFundId;
          const amt = String(r.amount ?? "");
          const memo = r.memo ?? "";

          if (acct.type === "ASSET" && r.entryType === "DEBIT") {
            newAsset.push({ id: uid(), accountId: r.accountId, fundId: fid, amount: amt, memo });
          } else if (acct.type === "LIABILITY" && r.entryType === "CREDIT") {
            newLiab.push({ id: uid(), accountId: r.accountId, fundId: fid, amount: amt, memo });
          } else if (acct.type === "EQUITY" && r.entryType === "CREDIT" && r.fundId) {
            rebuiltEquityMap[r.fundId] = r.accountId;
            rebuiltDirectAmounts[r.fundId] = String(r.amount ?? "");
          }
        }

        setAssetRows(newAsset.length ? newAsset : [{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setLiabilityRows(newLiab.length ? newLiab : [{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setFundEquityMap(rebuiltEquityMap);
        setDirectFundAmounts(rebuiltDirectAmounts);
      } else {
        setAssetRows([{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setLiabilityRows([{ id: uid(), accountId: "", fundId: firstFundId, amount: "", memo: "" }]);
        setFundEquityMap(defaultMap);
        setDirectFundAmounts({});
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sorted / filtered COA ────────────────────────────────────────────────────
  const sortedCoa = useMemo(() =>
    [...allCoa].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [allCoa]
  );
  const assetCoa     = useMemo(() => sortedCoa.filter((a) => a.type === "ASSET"),     [sortedCoa]);
  const liabilityCoa = useMemo(() => sortedCoa.filter((a) => a.type === "LIABILITY"), [sortedCoa]);
  const equityCoa    = useMemo(() => sortedCoa.filter((a) => a.type === "EQUITY"),    [sortedCoa]);

  // ── Method change ─────────────────────────────────────────────────────────────
  async function handleMethodChange(m: Method) {
    setMethod(m);
    await api("/api/opening-balance/method", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingMethod: m }),
    });
  }

  // ── Asset row ops ─────────────────────────────────────────────────────────────
  const addAssetRow    = () => setAssetRows((p) => [...p, { id: uid(), accountId: "", fundId: defaultFundId, amount: "", memo: "" }]);
  const deleteAssetRow = (id: string) => setAssetRows((p) => p.length <= 1 ? p : p.filter((r) => r.id !== id));
  const updateAssetRow = (id: string, patch: Partial<AssetRow>) =>
    setAssetRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));

  // ── Liability row ops ──────────────────────────────────────────────────────────
  const addLiabilityRow    = () => setLiabilityRows((p) => [...p, { id: uid(), accountId: "", fundId: defaultFundId, amount: "", memo: "" }]);
  const deleteLiabilityRow = (id: string) => setLiabilityRows((p) => p.length <= 1 ? p : p.filter((r) => r.id !== id));
  const updateLiabilityRow = (id: string, patch: Partial<LiabilityRow>) =>
    setLiabilityRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));

  // ── Computed totals ───────────────────────────────────────────────────────────
  const totalAssets = useMemo(
    () => assetRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [assetRows]
  );
  const totalLiabilities = useMemo(
    () => liabilityRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [liabilityRows]
  );
  const totalNetAssets = totalAssets - totalLiabilities;

  // ── Per-fund net assets ───────────────────────────────────────────────────────
  const fundNetMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of assetRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.fundId) map[r.fundId] = (map[r.fundId] || 0) + amt;
    }
    for (const r of liabilityRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.fundId) map[r.fundId] = (map[r.fundId] || 0) - amt;
    }
    return map;
  }, [assetRows, liabilityRows]);

  // All funds that appear in any row (have a non-zero balance)
  const activeFundIds = useMemo(() => Object.keys(fundNetMap), [fundNetMap]);

  // ── Equity totals by account (Section 3 data) ────────────────────────────────
  const equityTotals = useMemo(() => {
    const netForFund = (fundId: string) => {
      const directStr = directFundAmounts[fundId];
      if (directStr !== undefined) return parseFloat(directStr) || 0;
      return fundNetMap[fundId] ?? 0;
    };
    const map: Record<string, { total: number; fundNames: string[] }> = {};
    // Walk ALL funds (not just those with rows) so Section 3 shows as soon as equity is assigned
    for (const f of funds) {
      const eqAcctId = fundEquityMap[f.id];
      if (!eqAcctId) continue;
      const net = netForFund(f.id);
      if (!map[eqAcctId]) map[eqAcctId] = { total: 0, fundNames: [] };
      map[eqAcctId].total += net;
      map[eqAcctId].fundNames.push(f.name);
    }
    return Object.entries(map).map(([equityAccountId, { total, fundNames }]) => ({
      equityAccountId,
      total,
      fundNames,
    })).sort((a, b) => {
      const codeA = equityCoa.find((e) => e.id === a.equityAccountId)?.code ?? "";
      const codeB = equityCoa.find((e) => e.id === b.equityAccountId)?.code ?? "";
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
  }, [funds, fundEquityMap, fundNetMap, equityCoa, directFundAmounts]);

  const totalEquity = equityTotals.reduce((s, e) => s + e.total, 0);

  // ── Fund Balances (Section 4 data) ───────────────────────────────────────────
  // Show ALL active funds. Amount = directly typed value if set, else auto-computed from asset/liability rows.
  const fundBalances = useMemo(() => {
    return funds.map((f) => {
      const directStr = directFundAmounts[f.id];
      const netAmount = directStr !== undefined
        ? (parseFloat(directStr) || 0)
        : (fundNetMap[f.id] ?? 0);
      return { fund: f, netAmount, equityAccountId: fundEquityMap[f.id] ?? "" };
    });
  }, [funds, fundNetMap, fundEquityMap, directFundAmounts]);

  const totalFundBalances = fundBalances.reduce((s, fb) => s + fb.netAmount, 0);

  // ── Validation ────────────────────────────────────────────────────────────────
  const futureDateError  = asOfDate > format(new Date(), "yyyy-MM-dd");
  const activeAssets     = assetRows.filter((r) => parseFloat(r.amount) > 0);
  const activeLiabs      = liabilityRows.filter((r) => parseFloat(r.amount) > 0);
  const missingAssetAcct = activeAssets.some((r) => !r.accountId);
  const missingAssetFund = activeAssets.some((r) => !r.fundId);
  const missingLiabAcct  = activeLiabs.some((r) => !r.accountId);
  const missingLiabFund  = activeLiabs.some((r) => !r.fundId);
  const missingEquity    = fundBalances.some((fb) => Math.abs(fb.netAmount) > 0.001 && !fb.equityAccountId);
  const hasData          = totalAssets > 0 || totalFundBalances > 0;

  const canPost = hasData && !futureDateError
    && !missingAssetAcct && !missingAssetFund
    && !missingLiabAcct  && !missingLiabFund
    && !missingEquity && funds.length > 0;

  // ── Build final submit rows ───────────────────────────────────────────────────
  const finalSubmitRows = useMemo(() => {
    const rows: Array<{ accountId: string; fundId: string; amount: number; entryType: EntryType; memo: string | null }> = [];

    for (const r of assetRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.accountId && r.fundId)
        rows.push({ accountId: r.accountId, fundId: r.fundId, amount: amt, entryType: "DEBIT", memo: r.memo || null });
    }

    for (const r of liabilityRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt > 0 && r.accountId && r.fundId)
        rows.push({ accountId: r.accountId, fundId: r.fundId, amount: amt, entryType: "CREDIT", memo: r.memo || null });
    }

    // Auto-equity rows: one per fund per equity account assignment
    for (const fb of fundBalances) {
      if (Math.abs(fb.netAmount) > 0.001 && fb.equityAccountId) {
        rows.push({
          accountId: fb.equityAccountId,
          fundId: fb.fund.id,
          amount: Math.abs(fb.netAmount),
          entryType: fb.netAmount >= 0 ? "CREDIT" : "DEBIT",
          memo: `Opening Net Assets — ${fb.fund.name}`,
        });
      }
    }

    return rows;
  }, [assetRows, liabilityRows, fundBalances]);

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      const res = await api("/api/opening-balance/finalize", {
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
      const res = await api("/api/opening-balance/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setSyncResult(`Error: ${data.error ?? "Sync failed"}`); return; }
      const updated = data.bankBalancesUpdated?.length ?? 0;
      const txs     = data.transactionsCreated?.length ?? 0;
      setSyncResult(`Sync complete — ${updated} bank balance(s) updated, ${txs} transaction(s) created.`);
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    } finally { setSyncing(false); }
  }

  // ── CSV template ──────────────────────────────────────────────────────────────
  function downloadTemplate() {
    const hdr = ["Section (Asset/Liability)", "Account Code", "Fund Name", "Amount", "Memo"];
    const ex = [
      ["Asset", "1010", "General Fund", "50000.00", "Checking account balance"],
      ["Asset", "1010", "Payroll Fund", "5000.00", "Payroll checking"],
      ["Asset", "1020", "General Fund", "10000.00", "Savings balance"],
      ["Liability", "2010", "General Fund", "3000.00", "Accounts payable"],
    ];
    const csv = [hdr, ...ex].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a");
    a.href = url; a.download = "opening-balance-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV import ────────────────────────────────────────────────────────────────
  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text  = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;
      const parse = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "").trim());
      const hdr = parse(lines[0]).map((h) => h.toLowerCase());
      const sIdx = hdr.findIndex((h) => h.includes("section"));
      const cIdx = hdr.findIndex((h) => h.includes("account code") || h.includes("code"));
      const fIdx = hdr.findIndex((h) => h.includes("fund"));
      const aIdx = hdr.findIndex((h) => h.includes("amount"));
      const mIdx = hdr.findIndex((h) => h.includes("memo"));
      const newA: AssetRow[] = []; const newL: LiabilityRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parse(lines[i]);
        if (!cols[cIdx]) continue;
        const acct   = allCoa.find((a) => a.code === cols[cIdx]);
        const fund   = funds.find((f) => f.name.toLowerCase() === (cols[fIdx] ?? "").toLowerCase());
        const isLiab = (cols[sIdx] ?? "").toLowerCase().includes("liab");
        const row = { id: uid(), accountId: acct?.id ?? "", fundId: fund?.id ?? defaultFundId, amount: cols[aIdx] ?? "", memo: cols[mIdx] ?? "" };
        if (isLiab) newL.push(row); else newA.push(row);
      }
      if (newA.length) setAssetRows(newA);
      if (newL.length) setLiabilityRows(newL);
    };
    reader.readAsText(file);
  }

  // ── Account created ───────────────────────────────────────────────────────────
  function handleAccountCreated(newAcct: CoaAccount) {
    setAllCoa((prev) => [...prev, newAcct]);
    if (addAccountRowId) {
      if (addAccountSection === "asset")     updateAssetRow(addAccountRowId,     { accountId: newAcct.id });
      if (addAccountSection === "liability") updateLiabilityRow(addAccountRowId, { accountId: newAcct.id });
    }
    setShowAddAccount(false); setAddAccountSection(null); setAddAccountRowId(null);
  }

  // ── Column headers for the two editable sections ──────────────────────────────
  const ROW_HEADER_COLS = "1fr 160px 130px 1fr 32px";

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
              All bank account and fund balances are now updated. Your Dashboard is accurate.
            </p>
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
              }`}>{syncResult}</div>
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

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Enter starting balances by fund. Equity totals and fund balances auto-calculate below.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Download className="h-3.5 w-3.5" /> Template
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
            </label>
            <MethodToggle value={method} onChange={handleMethodChange} />
          </div>
        </div>

        {loadError && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-fit border-red-300" onClick={() => load()}>
              Retry
            </Button>
          </div>
        )}

        {/* Date + existing-entry banner */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opening Balance Date</Label>
            <div className="relative mt-1">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date" value={asOfDate}
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
        {/* SECTION 1 — Assets                                                     */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-blue-200">
          <div className="bg-blue-600 px-5 py-3 flex items-center gap-2 rounded-t-xl">
            <Landmark className="h-4 w-4 text-blue-100" />
            <span className="text-sm font-bold text-white">Assets</span>
            <span className="ml-auto text-xs text-blue-200">Bank, cash, receivables, equipment — all asset accounts</span>
          </div>
          {/* Column headers */}
          <div className="grid gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-[10px] font-bold text-blue-700 uppercase tracking-wide" style={{ gridTemplateColumns: ROW_HEADER_COLS }}>
            <span>Account</span><span>Fund</span><span>Amount ($)</span><span>Memo</span><span />
          </div>
          {/* Rows */}
          {assetRows.map((row) => (
            <LedgerRowInput
              key={row.id} row={row} funds={funds} accounts={assetCoa}
              onUpdate={(p) => updateAssetRow(row.id, p)}
              onDelete={() => deleteAssetRow(row.id)}
              canDelete={assetRows.length > 1}
              onAddNew={() => { setAddAccountType("ASSET"); setAddAccountSection("asset"); setAddAccountRowId(row.id); setShowAddAccount(true); }}
              placeholder="Asset account…"
            />
          ))}
          <div className="px-4 py-3 bg-blue-50/30 border-t border-blue-100">
            <button onClick={addAssetRow} className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors">
              <Plus className="h-4 w-4" /> Add asset row
            </button>
          </div>
          <div className="px-5 py-2.5 bg-blue-50 border-t border-blue-200 flex justify-between items-center">
            <span className="text-xs text-blue-600">{activeAssets.length} row{activeAssets.length !== 1 ? "s" : ""} with balances</span>
            <span className="text-sm font-bold text-blue-800">Total Assets: <span className="font-mono ml-2">{fmt(totalAssets)}</span></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2 — Liabilities                                               */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-orange-200">
          <div className="bg-orange-500 px-5 py-3 flex items-center gap-2 rounded-t-xl">
            <Scale className="h-4 w-4 text-orange-100" />
            <span className="text-sm font-bold text-white">Liabilities</span>
            <span className="ml-auto text-xs text-orange-100">Accounts payable, notes payable, deferred revenue, etc.</span>
          </div>
          {/* Column headers */}
          <div className="grid gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100 text-[10px] font-bold text-orange-700 uppercase tracking-wide" style={{ gridTemplateColumns: ROW_HEADER_COLS }}>
            <span>Account</span><span>Fund</span><span>Amount ($)</span><span>Memo</span><span />
          </div>
          {/* Rows */}
          {liabilityRows.map((row) => (
            <LedgerRowInput
              key={row.id} row={row} funds={funds} accounts={liabilityCoa}
              onUpdate={(p) => updateLiabilityRow(row.id, p)}
              onDelete={() => deleteLiabilityRow(row.id)}
              canDelete={liabilityRows.length > 1}
              onAddNew={() => { setAddAccountType("LIABILITY"); setAddAccountSection("liability"); setAddAccountRowId(row.id); setShowAddAccount(true); }}
              placeholder="Liability account…"
            />
          ))}
          <div className="px-4 py-3 bg-orange-50/30 border-t border-orange-100">
            <button onClick={addLiabilityRow} className="flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-900 transition-colors">
              <Plus className="h-4 w-4" /> Add liability row
            </button>
          </div>
          <div className="px-5 py-2.5 bg-orange-50 border-t border-orange-200 flex justify-between items-center">
            <span className="text-xs text-orange-600">{activeLiabs.length} row{activeLiabs.length !== 1 ? "s" : ""} with balances</span>
            <span className="text-sm font-bold text-orange-800">Total Liabilities: <span className="font-mono ml-2">{fmt(totalLiabilities)}</span></span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3 — Equity / Net Assets (auto-computed by equity account)      */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-violet-200">
          <div className="bg-violet-600 px-5 py-3 flex items-center gap-2 rounded-t-xl">
            <TrendingUp className="h-4 w-4 text-violet-100" />
            <span className="text-sm font-bold text-white">Equity / Net Assets</span>
            <span className="ml-auto text-xs text-violet-200">Auto-calculated from fund balances — grouped by equity account</span>
          </div>

          {equityTotals.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Assign equity accounts to funds in the Fund Balances section below to see totals here.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid gap-3 px-5 py-2 bg-violet-50 border-b border-violet-100 text-[10px] font-bold text-violet-700 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                <span>Equity Account</span>
                <span>Tied Funds</span>
                <span className="text-right min-w-[140px]">Total</span>
              </div>
              {equityTotals.map((eq) => {
                const acct = equityCoa.find((a) => a.id === eq.equityAccountId);
                return (
                  <div key={eq.equityAccountId} className="grid gap-3 px-5 py-3 border-b border-gray-100 items-center" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                    <div>
                      <span className="font-mono text-xs text-muted-foreground mr-2">{acct?.code}</span>
                      <span className="text-sm font-semibold">{acct?.name ?? "—"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {eq.fundNames.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No funds assigned yet</span>
                      ) : eq.fundNames.map((n) => (
                        <span key={n} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-medium">{n}</span>
                      ))}
                    </div>
                    <div className={cn("text-right text-sm font-bold tabular-nums min-w-[140px]", eq.total >= 0 ? "text-violet-700" : "text-red-600")}>
                      {fmt(eq.total)}
                    </div>
                  </div>
                );
              })}
              <div className="px-5 py-2.5 bg-violet-50 border-t border-violet-200 flex justify-between items-center">
                <span className="text-xs text-violet-600">{equityTotals.length} equity account{equityTotals.length !== 1 ? "s" : ""}</span>
                <span className="text-sm font-bold text-violet-800">Total Equity: <span className="font-mono ml-2">{fmt(totalEquity)}</span></span>
              </div>
            </>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 4 — Fund Balances (assign equity account per fund)             */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border-2 border-emerald-200">
          <div className="bg-emerald-600 px-5 py-3 flex items-center gap-2 rounded-t-xl">
            <Layers className="h-4 w-4 text-emerald-100" />
            <span className="text-sm font-bold text-white">Fund Balances</span>
            <span className="ml-auto text-xs text-emerald-200">Enter each fund's net opening balance and assign it to an equity account</span>
          </div>

          {fundBalances.length === 0 ? (
            <div className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No funds found. Create your funds first, then return here to set opening balances.</p>
              <a
                href={`${BASE}funds`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Go to Funds to create funds
              </a>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid gap-3 px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-[10px] font-bold text-emerald-700 uppercase tracking-wide" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr" }}>
                <span>Fund</span>
                <span>Equity Account (Net Assets)</span>
                <span className="text-right">Opening Balance</span>
              </div>

              {fundBalances.map(({ fund, netAmount, equityAccountId }) => {
                const directStr = directFundAmounts[fund.id];
                const displayStr = directStr !== undefined ? directStr : (netAmount !== 0 ? String(netAmount) : "");
                return (
                  <div key={fund.id} className="grid gap-3 px-5 py-3 border-b border-gray-100 items-center" style={{ gridTemplateColumns: "1.4fr 1.6fr 1fr" }}>
                    {/* Fund name + type badge */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{fund.name}</div>
                        {fund.fundType && (
                          <span className={cn(
                            "inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase mt-0.5",
                            fund.fundType === "UNRESTRICTED"    && "bg-blue-100 text-blue-700",
                            fund.fundType === "RESTRICTED_TEMP" && "bg-amber-100 text-amber-700",
                            fund.fundType === "RESTRICTED_PERM" && "bg-red-100 text-red-700",
                          )}>
                            {fund.fundType === "UNRESTRICTED"    ? "Unrestricted"
                              : fund.fundType === "RESTRICTED_TEMP" ? "Temp. Restricted"
                              : fund.fundType === "RESTRICTED_PERM" ? "Perm. Restricted"
                              : fund.fundType}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Equity account selector — custom combobox, same as asset/liability pickers */}
                    <EquityCombobox
                      accounts={equityCoa}
                      value={equityAccountId}
                      onChange={(id) => setFundEquityMap((prev) => ({ ...prev, [fund.id]: id }))}
                    />

                    {/* Editable fund balance amount */}
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none select-none">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={displayStr}
                        onChange={(e) => setDirectFundAmounts((prev) => ({ ...prev, [fund.id]: e.target.value }))}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) setDirectFundAmounts((prev) => ({ ...prev, [fund.id]: String(v) }));
                        }}
                        className={cn(
                          "w-full h-10 pl-6 pr-2 text-right text-sm font-semibold border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 tabular-nums",
                          netAmount < 0 ? "border-red-300 text-red-700" : "border-gray-300 text-emerald-700"
                        )}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="px-5 py-2.5 bg-emerald-50 border-t border-emerald-200 flex justify-between items-center rounded-b-xl">
                <span className="text-xs text-emerald-600">{fundBalances.length} fund{fundBalances.length !== 1 ? "s" : ""}</span>
                <span className="text-sm font-bold text-emerald-800">Total Fund Balances: <span className="font-mono ml-2">{fmt(totalFundBalances)}</span></span>
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
          {/* Accounting equation */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Assets</div>
              <div className="text-xl font-bold tabular-nums text-blue-700">{fmt(totalAssets)}</div>
            </div>
            <div className="text-muted-foreground font-light text-xl">−</div>
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Liabilities</div>
              <div className="text-xl font-bold tabular-nums text-orange-700">{fmt(totalLiabilities)}</div>
            </div>
            <div className="text-muted-foreground font-light text-xl">=</div>
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Equity</div>
              <div className="text-xl font-bold tabular-nums text-violet-700">{fmt(totalNetAssets)}</div>
            </div>
            <div className="text-muted-foreground font-light text-xl">=</div>
            <div className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Total Fund Balances</div>
              <div className="text-xl font-bold tabular-nums text-emerald-700">{fmt(totalFundBalances)}</div>
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
              {futureDateError   && <li className="text-xs text-red-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> Date cannot be in the future</li>}
              {missingAssetAcct  && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more asset rows is missing an account</li>}
              {missingAssetFund  && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more asset rows is missing a fund</li>}
              {missingLiabAcct   && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more liability rows is missing an account</li>}
              {missingLiabFund   && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more liability rows is missing a fund</li>}
              {missingEquity     && <li className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" /> One or more funds is missing an equity (Net Assets) account assignment</li>}
              {funds.length === 0 && <li className="text-xs text-red-700 flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-red-500 shrink-0" /> No funds found — create at least one fund first</li>}
            </ul>
          )}
        </div>

        {/* Force Sync */}
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
        open={showConfirm} onClose={() => setShowConfirm(false)}
        onConfirm={handleFinalize} saving={saving} error={error}
        submitRows={finalSubmitRows} allCoa={allCoa} funds={funds}
        asOfDate={asOfDate} method={method}
      />

      <AddAccountModal
        open={showAddAccount}
        onClose={() => { setShowAddAccount(false); setAddAccountSection(null); setAddAccountRowId(null); }}
        onCreated={handleAccountCreated}
        defaultType={addAccountType}
      />
    </AppLayout>
  );
}
