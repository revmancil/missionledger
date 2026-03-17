import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Heart, Receipt, TrendingUp, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboard();

  if (isLoading) return <AppLayout title="Dashboard"><div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard data...</div></AppLayout>;
  if (!data) return <AppLayout title="Dashboard"><div className="p-8">No data available</div></AppLayout>;

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <AppLayout title="Dashboard">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-card to-emerald-50/30 border-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Donations</h3>
              <Heart className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-3xl font-bold mt-2 text-emerald-700">{formatCurrency(data.totalDonations)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-orange-50/30 border-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Expenses</h3>
              <Receipt className="h-4 w-4 text-orange-500" />
            </div>
            <div className="text-3xl font-bold mt-2 text-orange-700">{formatCurrency(data.totalExpenses)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-blue-50/30 border-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-2">
              <h3 className="text-sm font-medium text-muted-foreground">Net Income</h3>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-3xl font-bold mt-2 text-blue-700">{formatCurrency(data.netIncome)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-2">
              <h3 className="text-sm font-medium text-muted-foreground">Transactions</h3>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mt-2">{data.transactionCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Donations vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `$${value/1000}k`} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="donations" name="Donations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center">
              {data.expenseByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.expenseByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="category"
                    >
                      {data.expenseByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-muted-foreground text-sm">No expense data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Heart className="w-4 h-4 text-emerald-500"/> Recent Donations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentDonations.map(item => (
                <div key={item.id} className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{item.donorName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(item.date)} · {item.type}</p>
                  </div>
                  <div className="font-semibold text-emerald-600">
                    +{formatCurrency(item.amount)}
                  </div>
                </div>
              ))}
              {data.recentDonations.length === 0 && <p className="text-sm text-muted-foreground">No recent donations</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Receipt className="w-4 h-4 text-orange-500"/> Recent Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentExpenses.map(item => (
                <div key={item.id} className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(item.date)} · {item.category}</p>
                  </div>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(item.amount)}
                  </div>
                </div>
              ))}
              {data.recentExpenses.length === 0 && <p className="text-sm text-muted-foreground">No recent expenses</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
