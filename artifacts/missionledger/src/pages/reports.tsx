import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfitLossReport, useGetBalanceSheetReport, useGetCashFlowReport, useGetFunds } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BookOpen, FileText, Table2, Download } from "lucide-react";

const BASE = import.meta.env.BASE_URL as string;

// ── Fund type helpers ─────────────────────────────────────────────────────────
const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED:     "Unrestricted",
  RESTRICTED_TEMP:  "Temp. Restricted",
  RESTRICTED_PERM:  "Perm. Restricted",
  BOARD_DESIGNATED: "Board Designated",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  UNRESTRICTED:     "bg-emerald-100 text-emerald-800",
  RESTRICTED_TEMP:  "bg-amber-100  text-amber-800",
  RESTRICTED_PERM:  "bg-red-100    text-red-800",
  BOARD_DESIGNATED: "bg-blue-100   text-blue-800",
};

// ── Shared fetch helper ────────────────────────────────────────────────────────
function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    setIsLoading(true);
    fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [url]);

  return { data, isLoading };
}

// ── GL by Account types ────────────────────────────────────────────────────────
interface GlAccountEntry {
  id: string;
  date: string;
  sourceType: string;
  fundName: string | null;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  runningBalance: number;
  description: string | null;
}
interface GlAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  coaType: string;
  beginBalance: number;
  entries: GlAccountEntry[];
  periodDebit: number;
  periodCredit: number;
  endBalance: number;
}

// ── General Journal types ──────────────────────────────────────────────────────
interface JournalSplit {
  id: string;
  accountCode: string;
  accountName: string;
  fundName: string | null;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  description: string | null;
}
interface JournalGroup {
  groupKey: string;
  date: string;
  sourceType: string;
  referenceNumber: string | null;
  description: string;
  entries: JournalSplit[];
  totalDebits: number;
  totalCredits: number;
}

// ── Transaction Register types ─────────────────────────────────────────────────
interface RegisterTxn {
  groupKey: string;
  date: string;
  sourceType: string;
  description: string;
  memo: string | null;
  checkNumber: string | null;
  fundName: string | null;
  debitAccounts: string | null;
  creditAccounts: string | null;
  amount: number;
}

const SOURCE_LABELS: Record<string, string> = {
  TRANSACTION:     "Bank",
  JOURNAL_ENTRY:   "Journal Entry",
  OPENING_BALANCE: "Opening Balance",
  MANUAL_JE:       "Manual JE",
};

type Tab = "financial" | "gl" | "journal" | "register";

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab]             = useState<Tab>("financial");
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate]     = useState(`${currentYear}-12-31`);
  const [applied, setApplied]     = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });
  const [fundFilter, setFundFilter] = useState("");

  const [bsAsOfDate, setBsAsOfDate] = useState(`${currentYear}-12-31`);
  const [bsQueryDate, setBsQueryDate] = useState(`${currentYear}-12-31`);

  // Transaction register extra filters
  const [search, setSearch]       = useState("");
  const [minAmt, setMinAmt]       = useState("");
  const [maxAmt, setMaxAmt]       = useState("");
  const [appliedSearch, setAppliedSearch] = useState({ search: "", minAmount: "", maxAmount: "" });

  const { data: profitLoss, isLoading: plLoading } = useGetProfitLossReport({ startDate: applied.startDate, endDate: applied.endDate });
  const { data: balanceSheet, isLoading: bsLoading } = useGetBalanceSheetReport({ asOfDate: bsQueryDate });
  const { data: cashFlow, isLoading: cfLoading } = useGetCashFlowReport({ startDate: applied.startDate, endDate: applied.endDate });
  const { data: funds = [] } = useGetFunds();

  // GL by Account
  const glByAccountParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) glByAccountParams.set("fundId", fundFilter);
  const { data: glByAccount, isLoading: glLoading } = useFetch<{ accounts: GlAccount[] }>(
    tab === "gl" ? `${BASE}api/reports/gl-by-account?${glByAccountParams}` : null
  );

  // General Journal
  const journalParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) journalParams.set("fundId", fundFilter);
  const { data: journalData, isLoading: journalLoading } = useFetch<{ groups: JournalGroup[]; totalGroups: number }>(
    tab === "journal" ? `${BASE}api/reports/general-journal?${journalParams}` : null
  );

  // Transaction Register
  const regParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) regParams.set("fundId", fundFilter);
  if (appliedSearch.search)     regParams.set("search", appliedSearch.search);
  if (appliedSearch.minAmount)  regParams.set("minAmount", appliedSearch.minAmount);
  if (appliedSearch.maxAmount)  regParams.set("maxAmount", appliedSearch.maxAmount);
  const { data: registerData, isLoading: regLoading } = useFetch<{ transactions: RegisterTxn[]; total: number }>(
    tab === "register" ? `${BASE}api/reports/transaction-register?${regParams}` : null
  );

  const handleApply = () => {
    setApplied({ startDate, endDate });
    setAppliedSearch({ search, minAmount: minAmt, maxAmount: maxAmt });
  };

  const chartData = [
    { name: "Revenue",   amount: profitLoss?.totalRevenue  || 0 },
    { name: "Expenses",  amount: profitLoss?.totalExpenses || 0 },
    { name: "Net Income", amount: profitLoss?.netIncome    || 0 },
  ];

  // CSV export for transaction register
  const exportCsv = useCallback(() => {
    const rows = registerData?.transactions ?? [];
    if (!rows.length) return;
    const headers = ["Date", "Type", "Description", "Memo", "Check #", "Fund", "Debit Accounts", "Credit Accounts", "Amount"];
    const lines = rows.map(r => [
      new Date(r.date).toLocaleDateString(),
      SOURCE_LABELS[r.sourceType] ?? r.sourceType,
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      `"${(r.memo ?? "").replace(/"/g, '""')}"`,
      r.checkNumber ?? "",
      r.fundName ?? "",
      `"${(r.debitAccounts ?? "").replace(/"/g, '""')}"`,
      `"${(r.creditAccounts ?? "").replace(/"/g, '""')}"`,
      r.amount.toFixed(2),
    ].join(","));
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaction-register-${applied.startDate}-${applied.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [registerData, applied]);

  const bs = balanceSheet as any;

  return (
    <AppLayout title="Financial Reports">
      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 mb-6 border-b border-border overflow-x-auto">
        {([
          { id: "financial", label: "Financial Statements", icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: "gl",        label: "General Ledger",       icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "journal",   label: "General Journal",      icon: <FileText className="w-3.5 h-3.5" /> },
          { id: "register",  label: "Transaction Register", icon: <Table2 className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Shared Filter Bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-6 bg-card border border-border rounded-xl p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start Date</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
        </div>
        {(tab === "gl" || tab === "journal" || tab === "register") && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fund</label>
            <select
              value={fundFilter}
              onChange={e => setFundFilter(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">All Funds</option>
              {(funds as any[]).map((f: any) => (
                <option key={f.id} value={f.id}>{f.name} — {FUND_TYPE_LABELS[f.fundType] ?? "Unrestricted"}</option>
              ))}
            </select>
          </div>
        )}
        {tab === "register" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</label>
              <Input placeholder="Payee, memo, account…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Min $</label>
              <Input type="number" placeholder="0" value={minAmt} onChange={e => setMinAmt(e.target.value)} className="w-24 h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Max $</label>
              <Input type="number" placeholder="Any" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} className="w-24 h-9" />
            </div>
          </>
        )}
        <Button onClick={handleApply} className="h-9">Apply</Button>
        {tab === "register" && (
          <Button variant="outline" onClick={exportCsv} className="h-9 gap-1.5">
            <Download className="w-4 h-4" />Export CSV
          </Button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FINANCIAL STATEMENTS TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "financial" && (
        <>
          {(plLoading || bsLoading || cfLoading) ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading reports…</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="bg-gradient-to-br from-card to-emerald-50/30 border-emerald-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 tabular-nums">{formatCurrency(profitLoss?.totalRevenue || 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-card to-red-50/30 border-red-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive tabular-nums">{formatCurrency(profitLoss?.totalExpenses || 0)}</p>
                  </CardContent>
                </Card>
                <Card className={`bg-gradient-to-br from-card border ${(profitLoss?.netIncome ?? 0) >= 0 ? "to-emerald-50/30 border-emerald-100" : "to-red-50/30 border-red-100"}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Net Income</span>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${(profitLoss?.netIncome ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(Math.abs(profitLoss?.netIncome || 0))}
                      {(profitLoss?.netIncome ?? 0) < 0 && <span className="text-sm font-normal ml-1">(deficit)</span>}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts + P&L + Balance Sheet side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                {/* Statement of Activities (P&L) */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Statement of Activities</CardTitle>
                    <p className="text-xs text-muted-foreground">{formatDate(profitLoss?.startDate ?? "")} – {formatDate(profitLoss?.endDate ?? "")}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Revenue */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Revenue</h4>
                      {(profitLoss?.revenue ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No revenue recorded.</p>
                      ) : (profitLoss?.revenue ?? []).map((r: any) => (
                        <div key={r.accountId} className="flex justify-between text-sm py-1 border-b border-border/40">
                          <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
                          <span className="font-medium tabular-nums text-emerald-700">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1.5 mt-1">
                        <span>Total Revenue</span>
                        <span className="text-emerald-700 tabular-nums">{formatCurrency(profitLoss?.totalRevenue || 0)}</span>
                      </div>
                    </div>
                    {/* Expenses */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expenses</h4>
                      {(profitLoss?.expenses ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No expenses recorded.</p>
                      ) : (profitLoss?.expenses ?? []).map((r: any) => (
                        <div key={r.accountId} className="flex justify-between text-sm py-1 border-b border-border/40">
                          <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
                          <span className="font-medium tabular-nums text-orange-700">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1.5 mt-1">
                        <span>Total Expenses</span>
                        <span className="text-orange-700 tabular-nums">{formatCurrency(profitLoss?.totalExpenses || 0)}</span>
                      </div>
                    </div>
                    {/* Net */}
                    <div className={`flex justify-between font-bold text-base pt-2 border-t-2 border-border ${(profitLoss?.netIncome ?? 0) >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                      <span>Change in Net Assets</span>
                      <span className="tabular-nums">{formatCurrency(Math.abs(profitLoss?.netIncome || 0))}{(profitLoss?.netIncome ?? 0) < 0 ? " (deficit)" : ""}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Balance Sheet — Statement of Financial Position */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Statement of Financial Position</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">As of {formatDate(bsQueryDate)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={bsAsOfDate}
                          onChange={e => setBsAsOfDate(e.target.value)}
                          className="w-36 h-7 text-xs"
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setBsQueryDate(bsAsOfDate)}>Go</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {bsLoading ? (
                      <div className="py-6 text-center text-muted-foreground animate-pulse text-sm">Loading…</div>
                    ) : (
                      <div className="space-y-4 text-sm">
                        {/* ASSETS */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assets</h4>
                          {(bs?.assets ?? []).length === 0 ? (
                            <p className="text-muted-foreground text-xs">No asset balances.</p>
                          ) : (bs?.assets ?? []).map((a: any) => (
                            <div key={a.accountId} className="flex justify-between py-0.5 border-b border-border/30">
                              <span className="text-muted-foreground">{a.accountCode} {a.accountName}</span>
                              <span className="tabular-nums font-medium">{formatCurrency(a.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Assets</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalAssets ?? 0)}</span>
                          </div>
                        </div>

                        {/* LIABILITIES */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Liabilities</h4>
                          {(bs?.liabilities ?? []).length === 0 ? (
                            <p className="text-muted-foreground text-xs">No liabilities.</p>
                          ) : (bs?.liabilities ?? []).map((a: any) => (
                            <div key={a.accountId} className="flex justify-between py-0.5 border-b border-border/30">
                              <span className="text-muted-foreground">{a.accountCode} {a.accountName}</span>
                              <span className="tabular-nums font-medium">{formatCurrency(a.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Liabilities</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalLiabilities ?? 0)}</span>
                          </div>
                        </div>

                        {/* NET ASSETS — Unrestricted */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Net Assets</h4>

                          {/* Unrestricted */}
                          <div className="mb-1">
                            <p className="text-xs font-medium text-emerald-700 mb-0.5">Unrestricted (General &amp; Payroll)</p>
                            <div className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                              <span className="text-muted-foreground">Equity Balances</span>
                              <span className="tabular-nums">{formatCurrency((bs?.totalUnrestrictedNetAssets ?? 0) - (bs?.unrestrictedNetIncome ?? 0))}</span>
                            </div>
                            {(bs?.unrestrictedNetIncome ?? 0) !== 0 && (
                              <div className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                                <span className="text-muted-foreground">Current Period Net Income</span>
                                <span className={`tabular-nums ${(bs?.unrestrictedNetIncome ?? 0) >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                                  {(bs?.unrestrictedNetIncome ?? 0) < 0 ? "(" : ""}{formatCurrency(Math.abs(bs?.unrestrictedNetIncome ?? 0))}{(bs?.unrestrictedNetIncome ?? 0) < 0 ? ")" : ""}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between py-0.5 pl-2 font-medium">
                              <span>Total Unrestricted</span>
                              <span className="tabular-nums">{formatCurrency(bs?.totalUnrestrictedNetAssets ?? 0)}</span>
                            </div>
                          </div>

                          {/* Restricted — per fund */}
                          {(bs?.restrictedFundDetails ?? []).length > 0 && (
                            <div className="mb-1">
                              <p className="text-xs font-medium text-amber-700 mb-0.5">Restricted</p>
                              {(bs?.restrictedFundDetails ?? []).map((f: any) => (
                                <div key={f.fundName} className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                                  <span className="text-muted-foreground">{f.fundName}</span>
                                  <span className="tabular-nums">{formatCurrency(f.netAssets)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between py-0.5 pl-2 font-medium">
                                <span>Total Restricted</span>
                                <span className="tabular-nums">{formatCurrency(bs?.totalRestrictedNetAssets ?? 0)}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Net Assets</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalNetAssets ?? 0)}</span>
                          </div>
                        </div>

                        {/* Total Liabilities + Net Assets */}
                        <div className="flex justify-between font-bold text-base pt-1 border-t-2 border-border">
                          <span>Total Liab. + Net Assets</span>
                          <span className="tabular-nums">{formatCurrency((bs?.totalLiabilities ?? 0) + (bs?.totalNetAssets ?? 0))}</span>
                        </div>

                        {/* Balance check */}
                        {(bs?.totalAssets ?? 0) > 0 && (
                          <div className={`mt-2 p-2 rounded-md text-xs font-medium ${Math.abs(bs?.difference ?? 0) <= 0.01 ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                            {Math.abs(bs?.difference ?? 0) <= 0.01
                              ? "✓ Books are in balance"
                              : `⚠ Out of balance by ${formatCurrency(Math.abs(bs?.difference ?? 0))}`}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Revenue vs Expenses Chart */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Revenue vs. Expenses</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(v)} />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL LEDGER BY ACCOUNT TAB                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "gl" && (
        <div className="space-y-4">
          {glLoading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading General Ledger…</div>
          ) : (glByAccount?.accounts ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No GL activity for this period.</CardContent></Card>
          ) : (
            (glByAccount?.accounts ?? []).map(acct => (
              <Card key={acct.accountId} className="overflow-hidden">
                {/* Account header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{acct.accountCode}</span>
                    <span className="font-semibold text-sm">{acct.accountName}</span>
                    <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{acct.coaType}</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${acct.endBalance >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    Balance: {formatCurrency(Math.abs(acct.endBalance))}{acct.endBalance < 0 ? " Cr" : ""}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-left">
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Fund</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Debit</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Credit</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {/* Beginning balance row */}
                      <tr className="bg-blue-50/50 text-muted-foreground italic">
                        <td className="px-3 py-1.5 text-xs">—</td>
                        <td className="px-3 py-1.5 text-xs font-medium">Beginning Balance</td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 text-right" />
                        <td className="px-3 py-1.5 text-right" />
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-foreground not-italic">
                          {formatCurrency(Math.abs(acct.beginBalance))}{acct.beginBalance < 0 ? " Cr" : ""}
                        </td>
                      </tr>
                      {acct.entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">No activity this period.</td>
                        </tr>
                      ) : acct.entries.map(e => (
                        <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-3 py-1.5 text-xs max-w-[220px] truncate">{e.description || SOURCE_LABELS[e.sourceType] || "—"}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[80px]">{e.fundName || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                            {e.entryType === "DEBIT" ? <span className="text-orange-600 font-medium">{formatCurrency(e.amount)}</span> : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                            {e.entryType === "CREDIT" ? <span className="text-emerald-600 font-medium">{formatCurrency(e.amount)}</span> : ""}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${e.runningBalance >= 0 ? "text-foreground" : "text-destructive"}`}>
                            {formatCurrency(Math.abs(e.runningBalance))}{e.runningBalance < 0 ? " Cr" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Account footer totals */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-semibold text-xs">
                        <td colSpan={3} className="px-3 py-2 text-muted-foreground uppercase tracking-wide">Period Totals</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-600">{formatCurrency(acct.periodDebit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{formatCurrency(acct.periodCredit)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${acct.endBalance >= 0 ? "" : "text-destructive"}`}>
                          {formatCurrency(Math.abs(acct.endBalance))}{acct.endBalance < 0 ? " Cr" : ""}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL JOURNAL TAB                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "journal" && (
        <div className="space-y-3">
          {journalLoading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading General Journal…</div>
          ) : (journalData?.groups ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No journal entries for this period.</CardContent></Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">{journalData?.totalGroups ?? 0} entries</p>
              {(journalData?.groups ?? []).map(grp => (
                <Card key={grp.groupKey} className="overflow-hidden">
                  {/* Entry header */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{formatDate(grp.date)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      grp.sourceType === "TRANSACTION" ? "bg-blue-100 text-blue-800"
                      : grp.sourceType === "OPENING_BALANCE" ? "bg-purple-100 text-purple-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{SOURCE_LABELS[grp.sourceType] ?? grp.sourceType}</span>
                    <span className="font-semibold text-sm flex-1">{grp.description}</span>
                    {grp.referenceNumber && (
                      <span className="text-xs text-muted-foreground">#{grp.referenceNumber}</span>
                    )}
                    {Math.abs(grp.totalDebits - grp.totalCredits) <= 0.01 ? (
                      <span className="text-xs text-emerald-600 font-medium">✓ Balanced</span>
                    ) : (
                      <span className="text-xs text-destructive font-medium">⚠ Unbalanced</span>
                    )}
                  </div>
                  {/* Splits */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-left">
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Debit</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {grp.entries.map(e => (
                          <tr key={e.id} className="hover:bg-muted/20">
                            <td className="px-4 py-1.5 text-xs">
                              <span className="font-mono text-muted-foreground mr-1.5">{e.accountCode}</span>
                              {e.accountName}
                            </td>
                            <td className="px-4 py-1.5 text-xs text-muted-foreground">{e.fundName || "—"}</td>
                            <td className="px-4 py-1.5 text-xs text-muted-foreground max-w-[160px] truncate">{e.description || "—"}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-xs font-medium">
                              {e.entryType === "DEBIT" ? <span className="text-orange-600">{formatCurrency(e.amount)}</span> : ""}
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-xs font-medium">
                              {e.entryType === "CREDIT" ? <span className="text-emerald-600">{formatCurrency(e.amount)}</span> : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20 font-semibold text-xs">
                          <td colSpan={3} className="px-4 py-1.5 text-muted-foreground">Totals</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-orange-600">{formatCurrency(grp.totalDebits)}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-emerald-600">{formatCurrency(grp.totalCredits)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TRANSACTION REGISTER TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "register" && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base">Transaction Register</CardTitle>
            <span className="text-xs text-muted-foreground">{registerData?.total ?? 0} records</span>
          </CardHeader>
          {regLoading ? (
            <CardContent className="py-12 text-center text-muted-foreground animate-pulse">Loading…</CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Type</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description / Payee</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Debit Accounts</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit Accounts</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(registerData?.transactions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                        No transactions found. Adjust filters and click Apply.
                      </td>
                    </tr>
                  ) : (registerData?.transactions ?? []).map(txn => (
                    <tr key={txn.groupKey} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(txn.date)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          txn.sourceType === "TRANSACTION" ? "bg-blue-100 text-blue-800"
                          : txn.sourceType === "OPENING_BALANCE" ? "bg-purple-100 text-purple-800"
                          : "bg-amber-100 text-amber-800"
                        }`}>{SOURCE_LABELS[txn.sourceType] ?? txn.sourceType}</span>
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[180px] truncate">{txn.description}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.memo || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[100px] truncate">{txn.fundName || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.debitAccounts || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.creditAccounts || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(txn.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {(registerData?.transactions ?? []).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-bold text-sm">
                      <td colSpan={7} className="px-3 py-2 text-muted-foreground">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency((registerData?.transactions ?? []).reduce((s, t) => s + t.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
    </AppLayout>
  );
}
