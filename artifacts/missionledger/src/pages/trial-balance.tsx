import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, RefreshCw, RotateCcw,
  BookOpen, TrendingUp, TrendingDown, Scale, Info, Layers,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

// ── Types ─────────────────────────────────────────────────────────────────────
interface TBAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | "UNKNOWN";
  totalDebit: number;
  totalCredit: number;
  balance: number; // debit - credit
}

interface TrialBalance {
  accounts: TBAccount[];
  grandTotalDebit: number;
  grandTotalCredit: number;
  difference: number;
  isBalanced: boolean;
  glEntryCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

const TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ASSET:     { label: "Assets",     color: "text-blue-700 bg-blue-50",    icon: <Scale   className="h-3.5 w-3.5" /> },
  LIABILITY: { label: "Liabilities", color: "text-orange-700 bg-orange-50", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  EQUITY:    { label: "Equity / Net Assets", color: "text-violet-700 bg-violet-50", icon: <Layers className="h-3.5 w-3.5" /> },
  INCOME:    { label: "Income",     color: "text-emerald-700 bg-emerald-50", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  EXPENSE:   { label: "Expenses",   color: "text-red-700 bg-red-50",       icon: <BookOpen className="h-3.5 w-3.5" /> },
  UNKNOWN:   { label: "Uncategorised", color: "text-gray-700 bg-gray-50",  icon: <Info className="h-3.5 w-3.5" /> },
};

// ── Balance Check Banner ──────────────────────────────────────────────────────
function BalanceBanner({ data }: { data: TrialBalance }) {
  const { isBalanced, grandTotalDebit, grandTotalCredit, difference, glEntryCount } = data;
  return (
    <div className={cn(
      "rounded-2xl border-2 px-6 py-5",
      isBalanced
        ? "border-emerald-200 bg-emerald-50"
        : "border-red-300 bg-red-50"
    )}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {isBalanced
            ? <div className="p-2.5 rounded-xl bg-emerald-100"><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div>
            : <div className="p-2.5 rounded-xl bg-red-100"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
          }
          <div>
            <p className={cn("text-lg font-bold", isBalanced ? "text-emerald-800" : "text-red-800")}>
              {isBalanced ? "Ledger In Balance" : "⚠ System Out of Balance"}
            </p>
            <p className="text-sm text-muted-foreground">
              {glEntryCount.toLocaleString()} GL entries · sum(debits) − sum(credits) = {isBalanced ? "$0.00" : fmt(difference)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-8 text-sm">
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total Debits</p>
            <p className="text-xl font-bold tabular-nums text-blue-700">{fmt(grandTotalDebit)}</p>
          </div>
          <div className="text-2xl font-bold text-muted-foreground/50">=</div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Total Credits</p>
            <p className="text-xl font-bold tabular-nums text-violet-700">{fmt(grandTotalCredit)}</p>
          </div>
          {!isBalanced && (
            <>
              <div className="text-2xl font-bold text-red-400">≠</div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Difference</p>
                <p className="text-xl font-bold tabular-nums text-red-600">{fmt(difference)}</p>
              </div>
            </>
          )}
        </div>
      </div>
      {!isBalanced && (
        <p className="text-xs text-red-700 mt-3 border-t border-red-200 pt-3">
          <strong>Action required:</strong> Run "Sync GL Entries" below to regenerate GL entries from all existing transactions and reconcile the imbalance. If the imbalance persists, contact your system administrator.
        </p>
      )}
    </div>
  );
}

// ── Account Group ─────────────────────────────────────────────────────────────
function AccountGroup({ type, accounts }: { type: string; accounts: TBAccount[] }) {
  const meta = TYPE_META[type] ?? TYPE_META.UNKNOWN;
  const groupDebit  = accounts.reduce((s, a) => s + a.totalDebit,  0);
  const groupCredit = accounts.reduce((s, a) => s + a.totalCredit, 0);
  const [open, setOpen] = useState(true);

  if (accounts.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-3 text-left hover:brightness-95 transition-all",
          meta.color
        )}
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          {meta.icon}
          {meta.label}
          <span className="font-normal opacity-60 text-xs">({accounts.length} accounts)</span>
        </div>
        <div className="flex items-center gap-12 text-sm tabular-nums font-semibold">
          <span>{fmt(groupDebit)}</span>
          <span>{fmt(groupCredit)}</span>
          <span className="w-4 opacity-50">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Account rows */}
      {open && (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">
            {accounts.map((a) => (
              <tr key={a.accountId} className="hover:bg-gray-50/70">
                <td className="px-5 py-2.5 w-24">
                  <span className="font-mono text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">{a.accountCode}</span>
                </td>
                <td className="px-3 py-2.5 text-foreground">{a.accountName}</td>
                <td className={cn(
                  "px-5 py-2.5 text-right font-mono tabular-nums w-36",
                  a.totalDebit > 0 ? "font-semibold text-blue-700" : "text-muted-foreground/30"
                )}>
                  {a.totalDebit > 0 ? fmt(a.totalDebit) : "—"}
                </td>
                <td className={cn(
                  "px-5 py-2.5 text-right font-mono tabular-nums w-36",
                  a.totalCredit > 0 ? "font-semibold text-violet-700" : "text-muted-foreground/30"
                )}>
                  {a.totalCredit > 0 ? fmt(a.totalCredit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrialBalancePage() {
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [data, setData]         = useState<TrialBalance | null>(null);
  const [error, setError]       = useState("");
  const [syncResult, setSyncResult] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await api(`${BASE}api/trial-balance`);
      if (!res.ok) { setError("Failed to load trial balance"); return; }
      setData(await res.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true); setSyncResult("");
    try {
      const res = await api(`${BASE}api/trial-balance/sync`, { method: "POST" });
      const d = await res.json();
      setSyncResult(`Synced ${d.synced} transactions${d.errors ? ` (${d.errors} errors)` : ""}`);
      await load();
    } catch { setSyncResult("Sync failed"); }
    finally { setSyncing(false); }
  }

  // Group accounts by type
  const grouped = TYPE_ORDER.reduce<Record<string, TBAccount[]>>((acc, t) => {
    acc[t] = (data?.accounts ?? []).filter((a) => a.accountType === t);
    return acc;
  }, {});

  return (
    <AppLayout title="Trial Balance">
      <div className="space-y-5 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Trial Balance</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Double-entry verification · sum(debits) − sum(credits) must equal $0.00
            </p>
          </div>
          <div className="flex items-center gap-3">
            {syncResult && (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                ✓ {syncResult}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={handleSync} disabled={syncing}
              className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              {syncing
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Syncing…</>
                : <><RotateCcw className="h-4 w-4" /> Sync GL Entries</>
              }
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-40" />
          </div>
        ) : data ? (
          <>
            {/* Balance banner */}
            <BalanceBanner data={data} />

            {/* GL Entry explainer */}
            {data.glEntryCount === 0 && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-100 bg-amber-50 text-sm text-amber-800">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  No GL entries found yet. Click <strong>Sync GL Entries</strong> to generate double-entry records
                  from all existing transactions, or new transactions will generate entries automatically going forward.
                </span>
              </div>
            )}

            {/* Column headers */}
            {data.accounts.length > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-5 pb-0.5">
                <span>Account</span>
                <span className="w-36 text-right text-blue-500">Debit</span>
                <span className="w-36 text-right text-violet-500 ml-2 pr-5">Credit</span>
              </div>
            )}

            {/* Account groups */}
            <div className="space-y-3">
              {TYPE_ORDER.map((type) => (
                <AccountGroup key={type} type={type} accounts={grouped[type] ?? []} />
              ))}
            </div>

            {/* Grand total row */}
            {data.accounts.length > 0 && (
              <div className={cn(
                "rounded-xl border-2 px-5 py-4 flex items-center justify-between",
                data.isBalanced ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
              )}>
                <span className="font-bold text-base">
                  {data.isBalanced ? "✓ Grand Totals" : "⚠ Grand Totals (Out of Balance)"}
                </span>
                <div className="flex items-center gap-12 font-bold tabular-nums text-base">
                  <span className="text-blue-700 w-36 text-right">{fmt(data.grandTotalDebit)}</span>
                  <span className="text-violet-700 w-36 text-right">{fmt(data.grandTotalCredit)}</span>
                </div>
              </div>
            )}

            {/* GAAP note */}
            <p className="text-[11px] text-muted-foreground text-center pb-2">
              Per GAAP double-entry accounting: Assets + Expenses = Liabilities + Equity + Revenue.
              Every transaction generates at minimum two GL entries (bank side + category side). Total debits must equal total credits.
            </p>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
