import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfitLossReport, useGetBalanceSheetReport, useGetCashFlowReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [queryParams, setQueryParams] = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });

  const { data: profitLoss, isLoading: plLoading } = useGetProfitLossReport({ startDate: queryParams.startDate, endDate: queryParams.endDate });
  const { data: balanceSheet, isLoading: bsLoading } = useGetBalanceSheetReport();
  const { data: cashFlow, isLoading: cfLoading } = useGetCashFlowReport({ startDate: queryParams.startDate, endDate: queryParams.endDate });

  const handleApply = () => setQueryParams({ startDate, endDate });

  if (plLoading || bsLoading || cfLoading) {
    return <AppLayout title="Financial Reports"><div className="py-12 text-center text-muted-foreground animate-pulse">Loading reports...</div></AppLayout>;
  }

  const chartData = [
    { name: "Revenue", amount: profitLoss?.totalRevenue || 0 },
    { name: "Expenses", amount: profitLoss?.totalExpenses || 0 },
    { name: "Net Income", amount: profitLoss?.netIncome || 0 },
  ];

  return (
    <AppLayout title="Financial Reports">
      {/* Date Filter */}
      <div className="flex flex-wrap items-end gap-3 mb-6 bg-card border border-border rounded-xl p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">Start Date</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase">End Date</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
        </div>
        <Button onClick={handleApply} className="h-9">Apply</Button>
      </div>

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
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* P&L Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statement of Activities (P&L)</CardTitle>
          </CardHeader>
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

        {/* Cash Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash Flow Statement</CardTitle>
          </CardHeader>
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

        {/* Balance Sheet */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Balance Sheet (Assets)</CardTitle>
          </CardHeader>
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
    </AppLayout>
  );
}
