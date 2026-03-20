import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Target,
  ArrowUpRight, ArrowDownRight, RefreshCw, Scissors,
  CheckCircle, Circle, CheckCheck,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashData {
  totalCash: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netMonthlyIncome: number;
  budgetProgress: { used: number; total: number; percent: number };
  spendingByCategory: Array<{ name: string; code: string; amount: number }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
  budgetTracker: Array<{ name: string; code: string; budgeted: number; actual: number; percent: number; overBudget: boolean }>;
  recentTransactions: Array<{
    id: string; date: string; payee: string; amount: number;
    type: "DEBIT" | "CREDIT"; status: string; isSplit: boolean;
    accountName: string | null; memo: string | null;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const DONUT_COLORS = [
  "hsl(210,60%,35%)",  // navy
  "hsl(174,60%,40%)",  // teal
  "hsl(38,95%,55%)",   // amber
  "hsl(261,70%,60%)",  // violet
  "hsl(335,75%,55%)",  // rose
  "hsl(195,75%,50%)",  // sky
  "hsl(150,55%,45%)",  // green
  "hsl(15,80%,55%)",   // orange
];

// ── Custom tooltip for bar chart ──────────────────────────────────────────────
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut label ───────────────────────────────────────────────────────────────
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold">{d.name}</p>
      <p className="text-muted-foreground">{fmtFull(d.value)}</p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, subtitle, icon: Icon, trend, color = "blue",
}: {
  title: string; value: string; subtitle?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral";
  color?: "blue" | "green" | "red" | "amber";
}) {
  const palettes = {
    blue:  { bg: "from-[hsl(210,60%,25%)] to-[hsl(210,60%,35%)]", text: "text-white", sub: "text-blue-200" },
    green: { bg: "from-emerald-600 to-emerald-500", text: "text-white", sub: "text-emerald-200" },
    red:   { bg: "from-red-600 to-rose-500", text: "text-white", sub: "text-red-200" },
    amber: { bg: "from-amber-500 to-amber-400", text: "text-white", sub: "text-amber-100" },
  };
  const p = palettes[color];
  return (
    <div className={cn("rounded-2xl p-5 bg-gradient-to-br shadow-md flex flex-col gap-3", p.bg)}>
      <div className="flex items-center justify-between">
        <p className={cn("text-sm font-medium opacity-90", p.sub)}>{title}</p>
        <div className="p-2 rounded-xl bg-white/15">
          <Icon className={cn("h-5 w-5", p.text)} />
        </div>
      </div>
      <div>
        <div className={cn("text-3xl font-bold tracking-tight", p.text)}>{value}</div>
        {subtitle && <div className={cn("text-xs mt-1 flex items-center gap-1", p.sub)}>
          {trend === "up" && <ArrowUpRight className="h-3 w-3" />}
          {trend === "down" && <ArrowDownRight className="h-3 w-3" />}
          {subtitle}
        </div>}
      </div>
    </div>
  );
}

// ── Budget Progress Bar ───────────────────────────────────────────────────────
function BudgetBar({ name, budgeted, actual, percent, overBudget }: {
  name: string; budgeted: number; actual: number; percent: number; overBudget: boolean;
}) {
  const cap = Math.min(percent, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate max-w-[60%]">{name}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("font-semibold tabular-nums", overBudget ? "text-red-600" : "text-muted-foreground")}>
            {fmtFull(actual)}
          </span>
          {budgeted > 0 && (
            <span className="text-muted-foreground">/ {fmtFull(budgeted)}</span>
          )}
          {overBudget && (
            <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">OVER</span>
          )}
        </div>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            overBudget ? "bg-red-500" : percent > 80 ? "bg-amber-400" : "bg-[hsl(174,60%,40%)]"
          )}
          style={{ width: `${cap}%` }}
        />
      </div>
    </div>
  );
}

// ── Status icon ───────────────────────────────────────────────────────────────
function TxStatusIcon({ status }: { status: string }) {
  if (status === "CLEARED" || status === "RECONCILED")
    return <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />;
  return <Circle className="h-4 w-4 text-amber-400 shrink-0" />;
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/dashboard`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  const handleGlobalSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(`${BASE}api/opening-balance/recalculate`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) {
        setSyncMsg({ type: "err", text: body.error ?? "Sync failed. Please try again." });
      } else {
        setSyncMsg({ type: "ok", text: body.message ?? "All Bank and Fund balances have been recalculated based on the General Ledger." });
        load(); // Refresh dashboard KPIs
      }
    } catch {
      setSyncMsg({ type: "err", text: "Network error. Please try again." });
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AppLayout title="Executive Dashboard">
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin opacity-40" />
            <p className="text-sm">Loading financial data…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout title="Executive Dashboard">
        <div className="py-16 text-center text-muted-foreground">Unable to load dashboard data.</div>
      </AppLayout>
    );
  }

  const netPositive = data.netMonthlyIncome >= 0;
  const budgetPct = data.budgetProgress.percent;
  const budgetColor = budgetPct >= 100 ? "red" : budgetPct >= 80 ? "amber" : "green";

  return (
    <AppLayout title="Executive Dashboard">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mt-2 mb-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[hsl(210,60%,25%)]">Executive Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Financial overview · {format(new Date(), "MMMM yyyy")}
          </p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="self-start sm:self-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Cash on Hand"
          value={fmt(data.totalCash)}
          subtitle="All bank accounts combined"
          icon={Wallet}
          color="blue"
        />
        <KpiCard
          title="Net Monthly Income"
          value={fmt(Math.abs(data.netMonthlyIncome))}
          subtitle={netPositive ? "Surplus this month" : "Deficit this month"}
          icon={netPositive ? TrendingUp : TrendingDown}
          trend={netPositive ? "up" : "down"}
          color={netPositive ? "green" : "red"}
        />
        <KpiCard
          title="Monthly Deposits"
          value={fmt(data.monthlyIncome)}
          subtitle="Income received this month"
          icon={ArrowUpRight}
          color="green"
        />
        <KpiCard
          title="Budget Used"
          value={`${budgetPct}%`}
          subtitle={
            data.budgetProgress.total > 0
              ? `${fmt(data.budgetProgress.used)} of ${fmt(data.budgetProgress.total)}`
              : "No active budget"
          }
          icon={Target}
          color={budgetColor}
        />
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Income vs Expenses Bar Chart — spans 3 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[hsl(210,60%,25%)]">Income vs. Expenses</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 6 months · from Bank Register</p>
            </div>
          </div>
          {data.monthlyTrend.every((m) => m.income === 0 && m.expenses === 0) ? (
            <div className="flex items-center justify-center h-52 text-muted-foreground text-sm italic">
              No transaction data yet — add transactions in the Bank Register.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.monthlyTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#888" }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  tick={{ fontSize: 11, fill: "#888" }} axisLine={false} tickLine={false}
                />
                <Tooltip content={<BarTooltip />} />
                <Legend
                  formatter={(v) => <span className="text-xs capitalize text-gray-600">{v}</span>}
                  iconType="circle" iconSize={8}
                />
                <Bar dataKey="income" name="Income" fill="hsl(174,60%,40%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="hsl(210,60%,35%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Spending by Category Donut — spans 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-3">
            <h3 className="font-semibold text-[hsl(210,60%,25%)]">Spending by Category</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Top expense accounts</p>
          </div>
          {data.spendingByCategory.length === 0 ? (
            <div className="flex items-center justify-center h-52 text-muted-foreground text-sm italic text-center px-4">
              No expense transactions yet.
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={data.spendingByCategory}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={78}
                    paddingAngle={2}
                  >
                    {data.spendingByCategory.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="w-full mt-1 space-y-1.5">
                {data.spendingByCategory.slice(0, 5).map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      <span className="truncate text-foreground">{cat.name}</span>
                    </div>
                    <span className="font-medium tabular-nums ml-2 shrink-0">{fmt(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Budget Tracker + Activity Feed ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Budget Tracker */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[hsl(210,60%,25%)]">Budget Tracker</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Top 5 expense accounts · YTD actuals</p>
            </div>
            <Target className="h-5 w-5 text-muted-foreground" />
          </div>

          {data.budgetTracker.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm italic text-center">
              No expense transactions recorded yet.
            </div>
          ) : (
            <div className="space-y-5">
              {data.budgetTracker.map((b, i) => (
                <BudgetBar key={i} {...b} />
              ))}
            </div>
          )}
        </div>

        {/* ── Data Tools ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-[hsl(210,60%,25%)]">Data Tools</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Administrative utilities for correcting account balances
              </p>
            </div>
            <button
              onClick={handleGlobalSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[hsl(210,60%,40%)] hover:bg-[hsl(210,60%,30%)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Recalculating…" : "Force Global Balance Sync"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Resets all bank account balances to <strong>$0.00</strong>, then replays every GL entry to rebuild
            accurate balances from scratch. Also repairs Opening Balance transactions so the Journal Entry
            detail view is accessible. Run this once if balances are out of sync.
          </p>
          {syncMsg && (
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${
              syncMsg.type === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {syncMsg.text}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-[hsl(210,60%,25%)]">Recent Activity</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 10 transactions</p>
            </div>
            <CheckCheck className="h-5 w-5 text-muted-foreground" />
          </div>

          {data.recentTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm italic">
              No transactions yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recentTransactions.map((tx) => (
                <div key={tx.id} className="py-2.5 flex items-center gap-3">
                  <TxStatusIcon status={tx.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{tx.payee}</span>
                      {tx.isSplit && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
                          <Scissors className="h-2.5 w-2.5" /> Split
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(tx.date), "MMM d, yyyy")}
                      </span>
                      {tx.accountName && (
                        <>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className="text-xs text-muted-foreground truncate">{tx.accountName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn(
                      "text-sm font-semibold tabular-nums",
                      tx.type === "CREDIT" ? "text-emerald-600" : "text-red-500"
                    )}>
                      {tx.type === "CREDIT" ? "+" : "−"}{fmtFull(tx.amount)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {tx.type === "CREDIT" ? "Deposit" : "Payment"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
