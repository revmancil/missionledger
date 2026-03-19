import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfitLossReport, useGetBalanceSheetReport, useGetCashFlowReport, useGetFunds } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BookOpen } from "lucide-react";

const BASE = import.meta.env.BASE_URL as string;

// ── Fund type helpers ─────────────────────────────────────────────────────────
const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Restricted (Temp)",
  RESTRICTED_PERM: "Restricted (Perm)",
  BOARD_DESIGNATED: "Board Designated",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  UNRESTRICTED: "bg-emerald-100 text-emerald-800",
  RESTRICTED_TEMP: "bg-amber-100 text-amber-800",
  RESTRICTED_PERM: "bg-red-100 text-red-800",
  BOARD_DESIGNATED: "bg-blue-100 text-blue-800",
};

// ── GL Types ──────────────────────────────────────────────────────────────────
interface GlEntry {
  id: string;
  date: string;
  sourceType: string;
  accountCode: string;
  accountName: string;
  fundId: string | null;
  fundName: string | null;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  description: string | null;
}
interface FundBalance {
  fundId: string;
  fundName: string;
  fundType: string;
  netBalance: number;
  totalCredits: number;
  totalDebits: number;
}
interface GlReport {
  startDate: string;
  endDate: string;
  entries: GlEntry[];
  fundBalances: FundBalance[];
  totalEntries: number;
}

function useGlReport(params: { startDate: string; endDate: string; fundId?: string }) {
  const [data, setData] = useState<GlReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const qs = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
    if (params.fundId) qs.set("fundId", params.fundId);
    fetch(`${BASE}api/reports/general-ledger?${qs}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [params.startDate, params.endDate, params.fundId]);

  return { data, isLoading };
}

type Tab = "financial" | "gl";

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState<Tab>("financial");
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [queryParams, setQueryParams] = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });
  const [glFundFilter, setGlFundFilter] = useState("");

  const { data: profitLoss, isLoading: plLoading } = useGetProfitLossReport({ startDate: queryParams.startDate, endDate: queryParams.endDate });
  const { data: balanceSheet, isLoading: bsLoading } = useGetBalanceSheetReport();
  const { data: cashFlow, isLoading: cfLoading } = useGetCashFlowReport({ startDate: queryParams.startDate, endDate: queryParams.endDate });
  const { data: funds = [] } = useGetFunds();

  const { data: glData, isLoading: glLoading } = useGlReport({
    startDate: queryParams.startDate,
    endDate: queryParams.endDate,
    fundId: glFundFilter || undefined,
  });

  const handleApply = () => setQueryParams({ startDate, endDate });

  const chartData = [
    { name: "Revenue", amount: profitLoss?.totalRevenue || 0 },
    { name: "Expenses", amount: profitLoss?.totalExpenses || 0 },
    { name: "Net Income", amount: profitLoss?.netIncome || 0 },
  ];

  return (
    <AppLayout title="Financial Reports">
      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setTab("financial")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "financial" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Financial Statements
        </button>
        <button
          onClick={() => setTab("gl")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "gl" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          General Ledger
        </button>
      </div>

      {/* Date Filter (shared) */}
      <div className="flex flex-wrap items-end gap-3 mb-6 bg-card border border-border rounded-xl p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">Start Date</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">End Date</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
        </div>
        {tab === "gl" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase">Fund</label>
            <select
              value={glFundFilter}
              onChange={e => setGlFundFilter(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">All Funds</option>
              {funds.map((f: any) => (
                <option key={f.id} value={f.id}>{f.name} — {FUND_TYPE_LABELS[f.fundType] ?? "Unrestricted"}</option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={handleApply} className="h-9">Apply</Button>
      </div>

      {/* ── Financial Statements Tab ─────────────────────────────────────────── */}
      {tab === "financial" && (
        <>
          {(plLoading || bsLoading || cfLoading) ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading reports...</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="bg-gradient-to-br from-card to-emerald-50/30 border-emerald-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">{formatCurrency(profitLoss?.totalRevenue || 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-card to-orange-50/30 border-orange-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-orange-600" />
                      <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                    </div>
                    <p className="text-2xl font-bold text-orange-700">{formatCurrency(profitLoss?.totalExpenses || 0)}</p>
                  </CardContent>
                </Card>
                <Card className={`bg-gradient-to-br from-card ${(profitLoss?.netIncome || 0) >= 0 ? "to-blue-50/30 border-blue-100" : "to-red-50/30 border-red-100"}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className={`w-4 h-4 ${(profitLoss?.netIncome || 0) >= 0 ? "text-blue-600" : "text-red-600"}`} />
                      <p className="text-sm font-medium text-muted-foreground">Net Income</p>
                    </div>
                    <p className={`text-2xl font-bold ${(profitLoss?.netIncome || 0) >= 0 ? "text-blue-700" : "text-red-700"}`}>
                      {formatCurrency(profitLoss?.netIncome || 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts & Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle className="text-base">Income Summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Statement of Activities (P&L)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
                      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider pb-1">Revenue</div>
                      {(profitLoss?.revenue || []).map((r: any) => (
                        <div key={r.accountId} className="flex justify-between py-1 border-b border-border/50">
                          <span>{r.accountName}</span>
                          <span className="font-medium text-emerald-600">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                      {!(profitLoss?.revenue?.length) && <p className="text-muted-foreground text-xs">No revenue recorded</p>}
                      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider pb-1 pt-3">Expenses</div>
                      {(profitLoss?.expenses || []).map((e: any) => (
                        <div key={e.accountId} className="flex justify-between py-1 border-b border-border/50">
                          <span>{e.accountName}</span>
                          <span className="font-medium text-orange-600">{formatCurrency(e.amount)}</span>
                        </div>
                      ))}
                      {!(profitLoss?.expenses?.length) && <p className="text-muted-foreground text-xs">No expenses recorded</p>}
                      <div className="flex justify-between pt-3 font-bold text-base border-t border-border">
                        <span>Net Income</span>
                        <span className={(profitLoss?.netIncome || 0) >= 0 ? "text-emerald-600" : "text-destructive"}>
                          {formatCurrency(profitLoss?.netIncome || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Cash Flow Statement</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider pb-1">Operating Activities</div>
                      {(cashFlow?.operating || []).map((item: any) => (
                        <div key={item.accountId} className="flex justify-between py-1 border-b border-border/50">
                          <span>{item.accountName}</span>
                          <span className={`font-medium ${item.amount >= 0 ? "text-emerald-600" : "text-orange-600"}`}>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 font-bold text-base border-t border-border">
                        <span>Net Cash Flow</span>
                        <span className={(cashFlow?.totalCashFlow || 0) >= 0 ? "text-emerald-600" : "text-destructive"}>
                          {formatCurrency(cashFlow?.totalCashFlow || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Balance Sheet (Assets)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
                      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider pb-1">Assets</div>
                      {(balanceSheet?.assets || []).map((a: any) => (
                        <div key={a.accountId} className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">{a.accountCode} {a.accountName}</span>
                          <span className="font-medium">{formatCurrency(a.amount)}</span>
                        </div>
                      ))}
                      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider pb-1 pt-3">Liabilities</div>
                      {(balanceSheet?.liabilities || []).map((l: any) => (
                        <div key={l.accountId} className="flex justify-between py-1 border-b border-border/50">
                          <span className="text-muted-foreground">{l.accountCode} {l.accountName}</span>
                          <span className="font-medium">{formatCurrency(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {/* ── General Ledger Tab ───────────────────────────────────────────────── */}
      {tab === "gl" && (
        <div className="space-y-6">
          {glLoading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading General Ledger...</div>
          ) : (
            <>
              {/* Fund Balance Summary */}
              {(glData?.fundBalances?.length ?? 0) > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Fund Balances</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {glData!.fundBalances.map(fb => (
                      <Card key={fb.fundId} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-semibold text-sm leading-tight">{fb.fundName}</p>
                              <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium ${FUND_TYPE_COLORS[fb.fundType] ?? FUND_TYPE_COLORS.UNRESTRICTED}`}>
                                {FUND_TYPE_LABELS[fb.fundType] ?? "Unrestricted"}
                              </span>
                            </div>
                            <p className={`text-lg font-bold tabular-nums shrink-0 ${fb.netBalance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                              {formatCurrency(Math.abs(fb.netBalance))}
                              {fb.netBalance < 0 && <span className="text-xs font-normal ml-0.5">(deficit)</span>}
                            </p>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
                            <span>Credits: <span className="text-emerald-600 font-medium">{formatCurrency(fb.totalCredits)}</span></span>
                            <span>Debits: <span className="text-orange-600 font-medium">{formatCurrency(fb.totalDebits)}</span></span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* GL Entry Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                  <CardTitle className="text-base">GL Entries</CardTitle>
                  <span className="text-xs text-muted-foreground">{glData?.totalEntries ?? 0} entries</span>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Debit</th>
                        <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(glData?.entries ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">
                            No GL entries found for this period. Add transactions in the Check Register to see entries here.
                          </td>
                        </tr>
                      ) : (
                        (glData?.entries ?? []).map(entry => (
                          <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(entry.date)}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{entry.description || "—"}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs text-muted-foreground mr-1">{entry.accountCode}</span>
                              {entry.accountName}
                            </td>
                            <td className="px-3 py-2">
                              {entry.fundName ? (
                                <span className="text-muted-foreground text-xs">{entry.fundName}</span>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {entry.entryType === "DEBIT" ? (
                                <span className="font-medium text-orange-600">{formatCurrency(entry.amount)}</span>
                              ) : ""}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {entry.entryType === "CREDIT" ? (
                                <span className="font-medium text-emerald-600">{formatCurrency(entry.amount)}</span>
                              ) : ""}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {(glData?.entries ?? []).length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                          <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wide">Totals</td>
                          <td className="px-3 py-2 text-right tabular-nums text-orange-600">
                            {formatCurrency((glData?.entries ?? []).filter(e => e.entryType === "DEBIT").reduce((s, e) => s + e.amount, 0))}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                            {formatCurrency((glData?.entries ?? []).filter(e => e.entryType === "CREDIT").reduce((s, e) => s + e.amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}
