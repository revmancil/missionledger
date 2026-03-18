import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, Landmark, Scale, BookOpen,
  RefreshCw, Lock, ArrowRight, RotateCcw, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

// ── Types ─────────────────────────────────────────────────────────────────────
type Method = "CASH" | "ACCRUAL";
interface CoaAccount { id: string; code: string; name: string; type: string; isSystem: boolean; }
interface CoaGrouped {
  ASSET: CoaAccount[];
  LIABILITY: CoaAccount[];
  EQUITY: CoaAccount[];
}
type BalanceMap = Record<string, string>; // accountId → raw input string

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function parseAmt(s: string) { return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0; }
function sumGroup(ids: CoaAccount[], map: BalanceMap) {
  return ids.reduce((s, a) => s + parseAmt(map[a.id] ?? ""), 0);
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
            "px-5 py-2 text-sm font-semibold transition-all duration-150",
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

// ── Balance Entry Column ──────────────────────────────────────────────────────
function BalanceColumn({
  title, subtitle, accounts, balances, onChange, colorClass, iconEl, totalLabel,
}: {
  title: string; subtitle: string;
  accounts: CoaAccount[]; balances: BalanceMap;
  onChange: (id: string, val: string) => void;
  colorClass: string; iconEl: React.ReactNode; totalLabel: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = sumGroup(accounts, balances);
  const filledCount = accounts.filter((a) => parseAmt(balances[a.id] ?? "") > 0).length;

  return (
    <div className={cn("rounded-2xl border-2 overflow-hidden flex flex-col", colorClass)}>
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-3">
          {iconEl}
          <div>
            <h3 className="font-bold text-base">{title}</h3>
            <p className="text-xs opacity-75 mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-bold text-lg tabular-nums">{fmt(total)}</div>
            <div className="text-[10px] opacity-60 uppercase tracking-wide">{totalLabel}</div>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronUp className="h-4 w-4 opacity-50" />}
        </div>
      </div>

      {/* Account rows */}
      {!collapsed && (
        <div className="bg-white border-t flex-1">
          {accounts.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground italic">
              No accounts in this category. Add them in Chart of Accounts first.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {accounts.map((acct) => {
                const val = balances[acct.id] ?? "";
                const hasValue = parseAmt(val) > 0;
                return (
                  <div
                    key={acct.id}
                    className={cn("flex items-center gap-3 px-4 py-2.5 group", hasValue && "bg-blue-50/30")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground leading-tight">{acct.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{acct.code}</div>
                    </div>
                    <div className="relative w-36">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                      <Input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={val}
                        onChange={(e) => onChange(acct.id, e.target.value)}
                        className={cn(
                          "pl-6 h-8 text-sm text-right font-mono tabular-nums transition-colors",
                          hasValue && "border-blue-300 bg-white"
                        )}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Column footer total */}
          <div className="border-t bg-gray-50 px-4 py-2.5 flex justify-between items-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{totalLabel}</span>
            <span className={cn("font-bold tabular-nums", total > 0 ? "text-foreground" : "text-muted-foreground")}>{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Balance Check Bar ─────────────────────────────────────────────────────────
function BalanceCheck({
  assets, liabilities, equity, method,
}: { assets: number; liabilities: number; equity: number; method: Method }) {
  const diff = assets - (liabilities + equity);
  const balanced = Math.abs(diff) < 0.005;
  const hasData = assets > 0 || equity > 0;

  return (
    <div className={cn(
      "rounded-2xl border-2 px-6 py-4 transition-all",
      !hasData ? "border-gray-200 bg-gray-50" :
      balanced ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
    )}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Equation display */}
        <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
          <span className={cn("px-3 py-1.5 rounded-lg", assets > 0 ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-500")}>
            Assets&nbsp;&nbsp;{fmt(assets)}
          </span>
          <span className="text-muted-foreground font-bold text-base">=</span>
          {method === "ACCRUAL" && (
            <>
              <span className={cn("px-3 py-1.5 rounded-lg", liabilities > 0 ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-500")}>
                Liabilities&nbsp;&nbsp;{fmt(liabilities)}
              </span>
              <span className="text-muted-foreground font-bold">+</span>
            </>
          )}
          <span className={cn("px-3 py-1.5 rounded-lg", equity > 0 ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-500")}>
            {method === "CASH" ? "Net Assets" : "Equity"}&nbsp;&nbsp;{fmt(equity)}
          </span>
        </div>

        {/* Difference badge */}
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-base",
          !hasData ? "bg-gray-100 text-gray-400" :
          balanced ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        )}>
          {balanced && hasData
            ? <><CheckCircle2 className="h-5 w-5" /> Balanced — $0.00</>
            : <><AlertTriangle className="h-5 w-5" /> Difference: {fmt(diff)}</>
          }
        </div>
      </div>

      {!balanced && hasData && (
        <p className="text-xs text-red-600 mt-2">
          {diff > 0
            ? `Assets exceed Liabilities + Equity by ${fmt(diff)}. Add more equity or liabilities, or reduce assets.`
            : `Liabilities + Equity exceed Assets by ${fmt(Math.abs(diff))}. Add more asset balances or reduce the other side.`}
        </p>
      )}
    </div>
  );
}

// ── JE Preview Table ──────────────────────────────────────────────────────────
function JEPreview({
  coa, balances, method, date,
}: {
  coa: CoaGrouped; balances: BalanceMap; method: Method; date: string;
}) {
  const assets     = coa.ASSET.filter((a) => parseAmt(balances[a.id] ?? "") > 0);
  const liabilities = method === "ACCRUAL"
    ? coa.LIABILITY.filter((a) => parseAmt(balances[a.id] ?? "") > 0)
    : [];
  const equity     = coa.EQUITY.filter((a) => parseAmt(balances[a.id] ?? "") > 0);

  const totalDebit  = assets.reduce((s, a) => s + parseAmt(balances[a.id] ?? ""), 0);
  const totalCredit = [...liabilities, ...equity].reduce((s, a) => s + parseAmt(balances[a.id] ?? ""), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-[hsl(210,40%,97%)] border-b flex items-center justify-between">
        <div>
          <p className="font-semibold text-[hsl(210,60%,25%)]">Journal Entry Preview</p>
          <p className="text-xs text-muted-foreground">Opening Balance Entry · {date ? format(new Date(date), "MMMM d, yyyy") : "—"}</p>
        </div>
        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-semibold">POSTED on save</span>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="text-left px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
            <th className="text-left px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Code</th>
            <th className="text-right px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-32">Debit</th>
            <th className="text-right px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-32">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-blue-50/30">
              <td className="px-5 py-2">{a.name}</td>
              <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{a.code}</td>
              <td className="px-5 py-2 text-right font-semibold tabular-nums text-blue-700">{fmt(parseAmt(balances[a.id] ?? ""))}</td>
              <td className="px-5 py-2 text-right text-muted-foreground/30">—</td>
            </tr>
          ))}
          {liabilities.map((a) => (
            <tr key={a.id} className="hover:bg-orange-50/30">
              <td className="px-5 py-2 pl-8 text-muted-foreground">{a.name}</td>
              <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{a.code}</td>
              <td className="px-5 py-2 text-right text-muted-foreground/30">—</td>
              <td className="px-5 py-2 text-right font-semibold tabular-nums text-orange-700">{fmt(parseAmt(balances[a.id] ?? ""))}</td>
            </tr>
          ))}
          {equity.map((a) => (
            <tr key={a.id} className="hover:bg-violet-50/30">
              <td className="px-5 py-2 pl-8 text-muted-foreground">{a.name}</td>
              <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{a.code}</td>
              <td className="px-5 py-2 text-right text-muted-foreground/30">—</td>
              <td className="px-5 py-2 text-right font-semibold tabular-nums text-violet-700">{fmt(parseAmt(balances[a.id] ?? ""))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
          <tr>
            <td colSpan={2} className="px-5 py-2.5 font-bold text-sm">Totals</td>
            <td className="px-5 py-2.5 text-right font-bold tabular-nums text-blue-700">{fmt(totalDebit)}</td>
            <td className="px-5 py-2.5 text-right font-bold tabular-nums text-violet-700">{fmt(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Phase = "wizard" | "review" | "done";

export default function OpeningBalancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("wizard");
  const [method, setMethod] = useState<Method>("CASH");
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [coa, setCoa] = useState<CoaGrouped>({ ASSET: [], LIABILITY: [], EQUITY: [] });
  const [balances, setBalances] = useState<BalanceMap>({});
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [createdEntry, setCreatedEntry] = useState<{ entryNumber: string; totalAssets: number; totalLiabilities: number; totalEquity: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`${BASE}api/opening-balance`);
      if (!res.ok) return;
      const data = await res.json();
      setMethod(data.accountingMethod ?? "CASH");
      setCoa(data.coa ?? { ASSET: [], LIABILITY: [], EQUITY: [] });
      setExistingEntryId(data.openingBalanceEntryId ?? null);
      if (data.openingBalanceDate) setAsOfDate(data.openingBalanceDate.slice(0, 10));

      // Pre-fill existing balances from JE lines
      if (data.existingLines?.length) {
        const map: BalanceMap = {};
        for (const l of data.existingLines) {
          if (l.debit > 0) map[l.accountId] = String(l.debit);
          else if (l.credit > 0) map[l.accountId] = String(l.credit);
        }
        setBalances(map);
        if (data.openingBalanceEntryId) setPhase("review");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Method change: persist immediately ───────────────────────────────────
  async function handleMethodChange(m: Method) {
    setMethod(m);
    await api(`${BASE}api/opening-balance/method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingMethod: m }),
    });
  }

  function setBalance(id: string, val: string) {
    setBalances((prev) => ({ ...prev, [id]: val }));
  }

  // ── Computed totals ──────────────────────────────────────────────────────
  const totalAssets      = useMemo(() => sumGroup(coa.ASSET, balances), [coa.ASSET, balances]);
  const totalLiabilities = useMemo(() => method === "ACCRUAL" ? sumGroup(coa.LIABILITY, balances) : 0, [coa.LIABILITY, balances, method]);
  const totalEquity      = useMemo(() => sumGroup(coa.EQUITY, balances), [coa.EQUITY, balances]);
  const diff             = totalAssets - (totalLiabilities + totalEquity);
  const balanced         = Math.abs(diff) < 0.005 && (totalAssets > 0 || totalEquity > 0);

  // ── Build lines for submission ───────────────────────────────────────────
  function buildLines() {
    const lines: any[] = [];
    for (const a of coa.ASSET) {
      const amt = parseAmt(balances[a.id] ?? "");
      if (amt > 0) lines.push({ accountId: a.id, accountName: a.name, accountType: "ASSET", amount: amt });
    }
    if (method === "ACCRUAL") {
      for (const a of coa.LIABILITY) {
        const amt = parseAmt(balances[a.id] ?? "");
        if (amt > 0) lines.push({ accountId: a.id, accountName: a.name, accountType: "LIABILITY", amount: amt });
      }
    }
    for (const a of coa.EQUITY) {
      const amt = parseAmt(balances[a.id] ?? "");
      if (amt > 0) lines.push({ accountId: a.id, accountName: a.name, accountType: "EQUITY", amount: amt });
    }
    return lines;
  }

  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      const res = await api(`${BASE}api/opening-balance/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: asOfDate,
          accountingMethod: method,
          lines: buildLines(),
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "Failed to save opening balance");
        return;
      }
      const data = await res.json();
      setCreatedEntry(data);
      setPhase("done");
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-40" />
        </div>
      </AppLayout>
    );
  }

  // ── DONE phase ───────────────────────────────────────────────────────────
  if (phase === "done" && createdEntry) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="max-w-lg mx-auto py-10 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances Set!</h2>
            <p className="text-muted-foreground mt-1">Journal Entry <strong>{createdEntry.entryNumber}</strong> has been posted.</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-left space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Assets</span>
              <span className="font-semibold text-blue-700">{fmt(createdEntry.totalAssets)}</span>
            </div>
            {method === "ACCRUAL" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Liabilities</span>
                <span className="font-semibold text-orange-700">{fmt(createdEntry.totalLiabilities)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total {method === "CASH" ? "Net Assets" : "Equity"}</span>
              <span className="font-semibold text-violet-700">{fmt(createdEntry.totalEquity)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Accounting Method</span>
              <span className="font-semibold">{method === "CASH" ? "Cash Basis" : "Accrual Basis"}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Lock className="h-4 w-4 shrink-0" />
            Journal entry <strong>{createdEntry.entryNumber}</strong> is posted and locked in the ledger
          </div>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline" className="gap-2"
              onClick={() => { setPhase("wizard"); setCreatedEntry(null); }}
            >
              <RotateCcw className="h-4 w-4" /> Edit Balances
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── REVIEW phase ─────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="space-y-5 max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Review Opening Entry</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Confirm the journal entry before finalizing
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setPhase("wizard")} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Edit Balances
              </Button>
              <Button
                onClick={handleFinalize} disabled={saving || !balanced}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
              >
                {saving
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Posting…</>
                  : <><Lock className="h-4 w-4" /> {existingEntryId ? "Re-post Opening Entry" : "Post Opening Entry"}</>
                }
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {existingEntryId && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <Info className="h-4 w-4 shrink-0" />
              An existing opening balance entry will be voided and replaced with this new entry.
            </div>
          )}

          <BalanceCheck
            assets={totalAssets} liabilities={totalLiabilities}
            equity={totalEquity} method={method}
          />

          <JEPreview coa={coa} balances={balances} method={method} date={asOfDate} />
        </div>
      </AppLayout>
    );
  }

  // ── WIZARD phase ─────────────────────────────────────────────────────────
  return (
    <AppLayout title="Opening Balance Wizard">
      <div className="space-y-5 max-w-5xl mx-auto">

        {/* ── Page Header ───────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balance Wizard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set your starting account balances · <strong>Assets = Liabilities + Equity</strong>
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accounting Method</Label>
              <div className="mt-1">
                <MethodToggle value={method} onChange={handleMethodChange} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">As of Date</Label>
              <input
                type="date" value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="mt-1 block h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Method explainer */}
        <div className={cn(
          "flex items-start gap-3 p-4 rounded-xl border text-sm",
          method === "CASH"
            ? "bg-blue-50 border-blue-100 text-blue-800"
            : "bg-teal-50 border-teal-100 text-teal-800"
        )}>
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          {method === "CASH"
            ? <span><strong>Cash Basis:</strong> The Liabilities column is hidden to keep setup simple. Your organization tracks income and expenses only when cash changes hands. You can switch to Accrual at any time.</span>
            : <span><strong>Accrual Basis:</strong> All three columns are shown. Enter outstanding loans, credit card balances, and accounts payable in the Liabilities column alongside your assets and equity.</span>}
        </div>

        {/* ── Three Columns ────────────────────── */}
        <div className={cn(
          "grid gap-4",
          method === "ACCRUAL" ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 lg:grid-cols-2"
        )}>

          {/* ASSETS */}
          <BalanceColumn
            title="Assets"
            subtitle="1000-series · What you own"
            accounts={coa.ASSET}
            balances={balances}
            onChange={setBalance}
            colorClass="border-blue-200 bg-blue-50 text-blue-900"
            totalLabel="Total Assets"
            iconEl={<div className="p-2 rounded-lg bg-blue-100"><Landmark className="h-5 w-5 text-blue-700" /></div>}
          />

          {/* LIABILITIES (Accrual only) */}
          {method === "ACCRUAL" && (
            <BalanceColumn
              title="Liabilities"
              subtitle="2000-series · What you owe"
              accounts={coa.LIABILITY}
              balances={balances}
              onChange={setBalance}
              colorClass="border-orange-200 bg-orange-50 text-orange-900"
              totalLabel="Total Liabilities"
              iconEl={<div className="p-2 rounded-lg bg-orange-100"><Scale className="h-5 w-5 text-orange-700" /></div>}
            />
          )}

          {/* EQUITY / NET ASSETS */}
          <BalanceColumn
            title={method === "CASH" ? "Net Assets / Fund Balances" : "Equity / Net Assets"}
            subtitle="3000-series · General Fund, Building Fund…"
            accounts={coa.EQUITY}
            balances={balances}
            onChange={setBalance}
            colorClass="border-violet-200 bg-violet-50 text-violet-900"
            totalLabel={method === "CASH" ? "Total Net Assets" : "Total Equity"}
            iconEl={<div className="p-2 rounded-lg bg-violet-100"><BookOpen className="h-5 w-5 text-violet-700" /></div>}
          />
        </div>

        {/* ── Balance Check ────────────────────── */}
        <BalanceCheck
          assets={totalAssets} liabilities={totalLiabilities}
          equity={totalEquity} method={method}
        />

        {/* ── Actions ──────────────────────────── */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground max-w-sm">
            The Finalize button creates a <strong>posted journal entry</strong> with all asset accounts as debits
            and all liability/equity accounts as credits.
          </p>
          <Button
            onClick={() => setPhase("review")}
            disabled={!balanced}
            className={cn(
              "gap-2 px-8 h-11 text-base font-semibold transition-all",
              balanced
                ? "bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white shadow-md"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            )}
          >
            Review & Finalize <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
