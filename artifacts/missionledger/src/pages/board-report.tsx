import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, Banknote, Flame, Target, Shield,
  Users, RefreshCw, Plus, Trash2,
  CheckCircle2, Circle, Eye, EyeOff, Download,
  BarChart3, Scale, Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { downloadBoardReportPdf } from "@/lib/board-report-pdf";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

async function apiGet(path: string) {
  const res = await authJsonFetch(path);
  if (!res.ok) {
    const body = await readJsonSafe<{ error?: string; message?: string }>(res);
    throw new Error(body?.message || body?.error || "Request failed");
  }
  return res.json();
}

async function apiMutate(path: string, method: string, body?: unknown) {
  const res = await authJsonFetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await readJsonSafe<{ error?: string; message?: string }>(res);
    throw new Error(errBody?.message || errBody?.error || "Request failed");
  }
  return res.json();
}

type RiskStatus = "GREEN" | "YELLOW" | "RED";
type CommitteeType = "FINANCE" | "AUDIT" | "GOVERNANCE" | "EXECUTIVE" | "PROGRAM" | "OTHER";
type PeriodKind = "month" | "quarter" | "year" | "ytd";

const PERIOD_OPTIONS: { id: PeriodKind; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "ytd", label: "YTD" },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface PeriodAnchor {
  year: number;
  month: number;
  quarter: number;
}

function currentPeriodAnchor(): PeriodAnchor {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    quarter: Math.floor(now.getUTCMonth() / 3) + 1,
  };
}

function buildYearOptions(): number[] {
  const current = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= current - 20; y--) years.push(y);
  return years;
}

const YEAR_OPTIONS = buildYearOptions();

function utcYmdToday(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function utcMonthEndYmd(year: number, monthIndex0: number): string {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function resolveClientPeriod(
  kind: PeriodKind,
  anchor: PeriodAnchor,
): { kind: PeriodKind; startDate: string; endDate: string; label: string } {
  const now = new Date();
  const today = utcYmdToday();
  const y = anchor.year;
  const m = anchor.month - 1;

  if (kind === "month") {
    const startDate = `${y}-${String(anchor.month).padStart(2, "0")}-01`;
    const endDate = utcMonthEndYmd(y, m) > today ? today : utcMonthEndYmd(y, m);
    return { kind, startDate, endDate, label: `${MONTH_NAMES[m]} ${y}` };
  }
  if (kind === "quarter") {
    const qStart = (anchor.quarter - 1) * 3;
    const startDate = `${y}-${String(qStart + 1).padStart(2, "0")}-01`;
    const endDate = utcMonthEndYmd(y, qStart + 2) > today ? today : utcMonthEndYmd(y, qStart + 2);
    return { kind, startDate, endDate, label: `Q${anchor.quarter} ${y}` };
  }
  if (kind === "year") {
    const endDate = `${y}-12-31` > today ? today : `${y}-12-31`;
    return { kind, startDate: `${y}-01-01`, endDate, label: `Calendar Year ${y}` };
  }
  const endDate = y === now.getUTCFullYear() ? today : (`${y}-12-31` > today ? today : `${y}-12-31`);
  return {
    kind: "ytd",
    startDate: `${y}-01-01`,
    endDate,
    label: y === now.getUTCFullYear() ? `Year to Date ${y}` : `Calendar Year ${y}`,
  };
}

const EMPTY_PROFIT_LOSS: BoardReport["profitLoss"] = {
  startDate: "",
  endDate: "",
  totalRevenue: 0,
  totalExpenses: 0,
  netIncome: 0,
  topRevenue: [],
  topExpenses: [],
};

const EMPTY_BALANCE_SHEET: BoardReport["balanceSheet"] = {
  asOfDate: utcYmdToday(),
  totalAssets: 0,
  totalLiabilities: 0,
  totalNetAssets: 0,
  totalUnrestrictedNetAssets: 0,
  totalRestrictedNetAssets: 0,
  netIncome: 0,
  topAssets: [],
  topLiabilities: [],
};

const EMPTY_FUND_BALANCES: BoardReport["fundBalances"] = {
  asOfDate: utcYmdToday(),
  total: 0,
  items: [],
};

const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Temp. Restricted",
  RESTRICTED_PERM: "Perm. Restricted",
  BOARD_DESIGNATED: "Board Designated",
};

/** Normalize API payloads from older servers or partial responses. */
function normalizeBoardReport(raw: Record<string, unknown>, periodFilter: PeriodKind, anchor: PeriodAnchor): BoardReport {
  const period = (raw.period as BoardReport["period"] | undefined) ?? {
    year: new Date().getUTCFullYear(),
    quarter: Math.floor(new Date().getUTCMonth() / 3) + 1,
    label: `Q${Math.floor(new Date().getUTCMonth() / 3) + 1} ${new Date().getUTCFullYear()}`,
  };
  const dateRange = (raw.dateRange as BoardReport["dateRange"] | undefined) ?? resolveClientPeriod(periodFilter, anchor);
  const fh = (raw.financialHealth as Record<string, unknown> | undefined) ?? {};
  const budget = (fh.budget as BoardReport["financialHealth"]["budget"] | undefined) ?? {
    total: 0, actual: 0, percent: 0, remaining: 0,
  };

  return {
    ...(raw as unknown as BoardReport),
    dateRange,
    period,
    profitLoss: (raw.profitLoss as BoardReport["profitLoss"] | undefined) ?? {
      ...EMPTY_PROFIT_LOSS,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    balanceSheet: (raw.balanceSheet as BoardReport["balanceSheet"] | undefined) ?? {
      ...EMPTY_BALANCE_SHEET,
      asOfDate: dateRange.endDate,
    },
    fundBalances: (raw.fundBalances as BoardReport["fundBalances"] | undefined) ?? {
      ...EMPTY_FUND_BALANCES,
      asOfDate: dateRange.endDate,
    },
    financialHealth: {
      totalCash: Number(fh.totalCash ?? 0),
      cashAsOfDate: String(fh.cashAsOfDate ?? dateRange.endDate),
      bankAccounts: (fh.bankAccounts as BoardReport["financialHealth"]["bankAccounts"] | undefined) ?? [],
      periodRevenue: Number(fh.periodRevenue ?? fh.ytdRevenue ?? 0),
      periodExpenses: Number(fh.periodExpenses ?? fh.ytdExpenses ?? 0),
      periodNet: Number(fh.periodNet ?? fh.ytdNet ?? 0),
      periodBurnRate: Number(fh.periodBurnRate ?? fh.ytdBurnRate ?? 0),
      monthsOfRunway: (fh.monthsOfRunway as number | null | undefined) ?? null,
      budget,
    },
  };
}

interface BoardReport {
  generatedAt: string;
  dateRange: { kind: PeriodKind; startDate: string; endDate: string; label: string };
  period: { year: number; quarter: number; label: string };
  profitLoss: {
    startDate: string;
    endDate: string;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    topRevenue: Array<{ accountCode: string; accountName: string; amount: number }>;
    topExpenses: Array<{ accountCode: string; accountName: string; amount: number }>;
  };
  balanceSheet: {
    asOfDate: string;
    totalAssets: number;
    totalLiabilities: number;
    totalNetAssets: number;
    totalUnrestrictedNetAssets: number;
    totalRestrictedNetAssets: number;
    netIncome: number;
    topAssets: Array<{ accountCode: string; accountName: string; amount: number }>;
    topLiabilities: Array<{ accountCode: string; accountName: string; amount: number }>;
  };
  fundBalances: {
    asOfDate: string;
    total: number;
    items: Array<{ fundId: string; fundName: string; fundType: string; balance: number }>;
  };
  viewer: { role: string; isAdmin: boolean; isBoardMember: boolean; name: string | null };
  actionRequired: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    category: "financial" | "risk" | "program";
  }>;
  financialHealth: {
    totalCash: number;
    cashAsOfDate: string;
    bankAccounts: Array<{ id: string; name: string; lastFour: string | null; balance: number }>;
    periodRevenue: number;
    periodExpenses: number;
    periodNet: number;
    periodBurnRate: number;
    monthsOfRunway: number | null;
    budget: { total: number; actual: number; percent: number; remaining: number };
  };
  programmaticImpact: {
    period: { year: number; quarter: number };
    metrics: Array<{
      id: string;
      name: string;
      description: string | null;
      targetValue: number;
      actualValue: number;
      unit: string | null;
      percentOfTarget: number;
    }>;
    summary: { onTrack: number; atRisk: number; total: number } | null;
  };
  strategicRisks: {
    items: Array<{
      id: string;
      title: string;
      description: string | null;
      status: RiskStatus;
      ownerName: string | null;
      reviewDate: string | null;
      mitigation: string | null;
    }>;
    counts: { green: number; yellow: number; red: number };
  };
  committeeUpdates: Array<{
    id: string;
    committeeType: CommitteeType;
    title: string;
    body: string;
    meetingDate: string | null;
    authorName: string;
    isPublished: boolean;
    createdAt: string;
  }>;
}

const RISK_STYLES: Record<RiskStatus, { dot: string; bg: string; label: string }> = {
  GREEN: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", label: "On Track" },
  YELLOW: { dot: "bg-amber-400", bg: "bg-amber-50 border-amber-200", label: "Watch" },
  RED: { dot: "bg-red-500", bg: "bg-red-50 border-red-200", label: "Action Needed" },
};

const COMMITTEE_LABELS: Record<CommitteeType, string> = {
  FINANCE: "Finance",
  AUDIT: "Audit",
  GOVERNANCE: "Governance",
  EXECUTIVE: "Executive",
  PROGRAM: "Program",
  OTHER: "Other",
};

function SectionCard({ title, icon: Icon, children, action }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[hsl(210,60%,35%)]" />
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function BoardReportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "ADMIN" || user?.role === "MASTER_ADMIN";
  const [periodFilter, setPeriodFilter] = useState<PeriodKind>("ytd");
  const [periodAnchor, setPeriodAnchor] = useState<PeriodAnchor>(currentPeriodAnchor);
  const [adminView, setAdminView] = useState(false);
  const [metricDialog, setMetricDialog] = useState(false);
  const [riskDialog, setRiskDialog] = useState(false);
  const [committeeDialog, setCommitteeDialog] = useState(false);

  const queryKey = ["board-report", periodFilter, periodAnchor.year, periodAnchor.month, periodAnchor.quarter, adminView && isAdmin];

  const { data, isLoading, isError, refetch, isFetching } = useQuery<BoardReport>({
    queryKey,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("period", periodFilter);
      p.set("year", String(periodAnchor.year));
      if (periodFilter === "month") p.set("month", String(periodAnchor.month));
      if (periodFilter === "quarter") p.set("quarter", String(periodAnchor.quarter));
      if (adminView && isAdmin) p.set("adminView", "true");
      const raw = await apiGet(`api/board-report?${p.toString()}`);
      return normalizeBoardReport(raw as Record<string, unknown>, periodFilter, periodAnchor);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["board-report"] });

  const createMetric = useMutation({
    mutationFn: (body: unknown) => apiMutate("api/board-report/program-metrics", "POST", body),
    onSuccess: () => { invalidate(); setMetricDialog(false); toast.success("Metric added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createRisk = useMutation({
    mutationFn: (body: unknown) => apiMutate("api/board-report/strategic-risks", "POST", body),
    onSuccess: () => { invalidate(); setRiskDialog(false); toast.success("Risk added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCommittee = useMutation({
    mutationFn: (body: unknown) => apiMutate("api/board-report/committee-updates", "POST", body),
    onSuccess: () => { invalidate(); setCommitteeDialog(false); toast.success("Committee update posted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMetric = useMutation({
    mutationFn: (id: string) => apiMutate(`api/board-report/program-metrics/${id}`, "DELETE"),
    onSuccess: () => { invalidate(); toast.success("Metric removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRisk = useMutation({
    mutationFn: (id: string) => apiMutate(`api/board-report/strategic-risks/${id}`, "DELETE"),
    onSuccess: () => { invalidate(); toast.success("Risk removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCommittee = useMutation({
    mutationFn: (id: string) => apiMutate(`api/board-report/committee-updates/${id}`, "DELETE"),
    onSuccess: () => { invalidate(); toast.success("Update removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      apiMutate(`api/board-report/committee-updates/${id}`, "PUT", { isPublished }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppLayout title="Board Member Report">
        <div className="py-20 text-center text-muted-foreground">Preparing board report…</div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout title="Board Member Report">
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">Unable to load the board report.</p>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      </AppLayout>
    );
  }

  const showAdminTools = isAdmin && adminView;

  function handleDownloadPdf() {
    try {
      downloadBoardReportPdf(
        data,
        user?.companyName || "Organization",
        { adminView: showAdminTools },
      );
      toast.success("Board report PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  }

  return (
    <AppLayout title="Board Member Report">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Board Member Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data.dateRange.label} · {data.dateRange.startDate} – {data.dateRange.endDate}
            </p>
            <p className="text-xs text-muted-foreground">
              Updated {format(parseISO(data.generatedAt), "MMM d, yyyy h:mm a")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdminView((v) => !v)}
                className="gap-1.5"
              >
                {adminView ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {adminView ? "Admin view" : "Board view"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Download Board Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period</span>
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                size="sm"
                variant={periodFilter === opt.id ? "default" : "outline"}
                onClick={() => setPeriodFilter(opt.id)}
                disabled={isFetching && periodFilter === opt.id}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="h-5 w-px bg-border hidden sm:block" />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(periodAnchor.year)}
              onValueChange={(v) => setPeriodAnchor((a) => ({ ...a, year: parseInt(v, 10) }))}
            >
              <SelectTrigger className="w-[100px] h-8 text-sm bg-background">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodFilter === "month" && (
              <Select
                value={String(periodAnchor.month)}
                onValueChange={(v) => setPeriodAnchor((a) => ({ ...a, month: parseInt(v, 10) }))}
              >
                <SelectTrigger className="w-[140px] h-8 text-sm bg-background">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {periodFilter === "quarter" && (
              <Select
                value={String(periodAnchor.quarter)}
                onValueChange={(v) => setPeriodAnchor((a) => ({ ...a, quarter: parseInt(v, 10) }))}
              >
                <SelectTrigger className="w-[100px] h-8 text-sm bg-background">
                  <SelectValue placeholder="Quarter" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Action Required */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="font-semibold text-amber-900">Action Required</h2>
            {data.actionRequired.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {data.actionRequired.length}
              </Badge>
            )}
          </div>
          {data.actionRequired.length === 0 ? (
            <p className="text-sm text-amber-800/80 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              No urgent board actions at this time.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.actionRequired.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-sm",
                    item.severity === "high" && "bg-red-50 border-red-200",
                    item.severity === "medium" && "bg-white border-amber-200",
                    item.severity === "low" && "bg-white border-gray-200",
                  )}
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="text-muted-foreground mt-0.5">{item.description}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* High-level P&L */}
        <SectionCard title="Statement of Activities (Summary)" icon={BarChart3}>
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
              <div className="text-xs text-emerald-700">Total Revenue</div>
              <div className="text-xl font-bold text-emerald-800 mt-1">{fmt(data.profitLoss.totalRevenue)}</div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-4">
              <div className="text-xs text-red-700">Total Expenses</div>
              <div className="text-xl font-bold text-red-800 mt-1">{fmt(data.profitLoss.totalExpenses)}</div>
            </div>
            <div className={cn(
              "rounded-lg border p-4",
              data.profitLoss.netIncome >= 0 ? "bg-blue-50 border-blue-100" : "bg-amber-50 border-amber-100",
            )}>
              <div className="text-xs text-muted-foreground">Net Income</div>
              <div className="text-xl font-bold mt-1">{fmt(data.profitLoss.netIncome)}</div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Revenue</h3>
              {data.profitLoss.topRevenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No revenue in this period.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.profitLoss.topRevenue.map((r) => (
                    <li key={r.accountCode} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{r.accountCode} – {r.accountName}</span>
                      <span className="font-medium shrink-0">{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Expenses</h3>
              {data.profitLoss.topExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses in this period.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.profitLoss.topExpenses.map((r) => (
                    <li key={r.accountCode} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{r.accountCode} – {r.accountName}</span>
                      <span className="font-medium shrink-0">{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SectionCard>

        {/* High-level Balance Sheet */}
        <SectionCard title="Statement of Financial Position (Summary)" icon={Scale}>
          <p className="text-xs text-muted-foreground mb-4">As of {data.balanceSheet.asOfDate}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Total Assets</div>
              <div className="text-lg font-bold mt-1">{fmt(data.balanceSheet.totalAssets)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Total Liabilities</div>
              <div className="text-lg font-bold mt-1">{fmt(data.balanceSheet.totalLiabilities)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Net Assets</div>
              <div className="text-lg font-bold mt-1">{fmt(data.balanceSheet.totalNetAssets)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Unrestricted / Restricted</div>
              <div className="text-sm font-semibold mt-1">
                {fmt(data.balanceSheet.totalUnrestrictedNetAssets)} / {fmt(data.balanceSheet.totalRestrictedNetAssets)}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Assets</h3>
              {data.balanceSheet.topAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No asset balances.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.balanceSheet.topAssets.map((r) => (
                    <li key={r.accountCode} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{r.accountCode} – {r.accountName}</span>
                      <span className="font-medium shrink-0">{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Top Liabilities</h3>
              {data.balanceSheet.topLiabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No liability balances.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.balanceSheet.topLiabilities.map((r) => (
                    <li key={r.accountCode} className="flex justify-between text-sm gap-2">
                      <span className="truncate">{r.accountCode} – {r.accountName}</span>
                      <span className="font-medium shrink-0">{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Fund Balances */}
        <SectionCard title="Fund Balances" icon={Wallet}>
          <p className="text-xs text-muted-foreground mb-4">
            Net asset position by fund as of {data.fundBalances.asOfDate} (equity, income, and expense GL through that date).
          </p>
          {data.fundBalances.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No funds configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Fund</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.fundBalances.items.map((f) => (
                    <tr key={f.fundId} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{f.fundName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {FUND_TYPE_LABELS[f.fundType] ?? f.fundType}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-semibold tabular-nums",
                        f.balance < 0 ? "text-red-600" : "",
                      )}>
                        {fmt(f.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground" colSpan={2}>
                      Total across funds
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.fundBalances.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Financial Health */}
        <SectionCard title="Financial Health" icon={Banknote}>
          <p className="text-xs text-muted-foreground mb-4">
            Cash balances from the bank register as of {data.financialHealth.cashAsOfDate}. Period revenue and expenses match the Statement of Activities (GL income and expense accounts).
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg bg-[hsl(210,60%,25%)] text-white p-4">
              <div className="text-xs opacity-80">Cash Position</div>
              <div className="text-xl font-bold mt-1">{fmt(data.financialHealth.totalCash)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Period Revenue</div>
              <div className="text-lg font-semibold mt-1 text-emerald-700">{fmt(data.financialHealth.periodRevenue)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Period Expenses</div>
              <div className="text-lg font-semibold mt-1 text-red-700">{fmt(data.financialHealth.periodExpenses)}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Flame className="w-3 h-3" /> Avg. Burn Rate
              </div>
              <div className="text-lg font-semibold mt-1">{fmt(data.financialHealth.periodBurnRate)}/mo</div>
            </div>
          </div>

          {data.financialHealth.bankAccounts.length > 0 && (
            <div className="overflow-x-auto mb-5 rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Bank Account</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.financialHealth.bankAccounts.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {b.name}
                        {b.lastFour ? (
                          <span className="text-muted-foreground font-normal"> ••{b.lastFour}</span>
                        ) : null}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right font-semibold tabular-nums",
                        b.balance < 0 ? "text-red-600" : "",
                      )}>
                        {fmt(b.balance)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/20 font-semibold">
                    <td className="px-4 py-3">Total cash</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(data.financialHealth.totalCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 mb-5">
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Period Net</div>
              <div className={cn(
                "text-lg font-semibold mt-1 tabular-nums",
                data.financialHealth.periodNet >= 0 ? "text-emerald-700" : "text-red-600",
              )}>
                {fmt(data.financialHealth.periodNet)}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="text-xs text-muted-foreground">Est. Runway</div>
              <div className="text-lg font-semibold mt-1">
                {data.financialHealth.monthsOfRunway != null
                  ? `${data.financialHealth.monthsOfRunway} mo`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Budget vs. Actual (active budget)</span>
              <span className="text-muted-foreground">
                {fmt(data.financialHealth.budget.actual)} of {fmt(data.financialHealth.budget.total)}
              </span>
            </div>
            <Progress
              value={Math.min(data.financialHealth.budget.percent, 100)}
              className={cn("h-2", data.financialHealth.budget.percent >= 100 && "[&>div]:bg-red-500")}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{data.financialHealth.budget.percent}% used</span>
              <span>{fmt(data.financialHealth.budget.remaining)} remaining</span>
            </div>
          </div>
        </SectionCard>

        {/* Programmatic Impact */}
        <SectionCard
          title={`Programmatic Impact — ${data.period.label}`}
          icon={Target}
          action={showAdminTools && (
            <Button size="sm" variant="outline" onClick={() => setMetricDialog(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add metric
            </Button>
          )}
        >
          {data.programmaticImpact.metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No mission metrics configured for this quarter.
              {showAdminTools && " Add KPIs to track program outcomes for the board."}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {data.programmaticImpact.metrics.map((m) => (
                <div key={m.id} className="rounded-lg border p-4 relative">
                  {showAdminTools && (
                    <button
                      onClick={() => deleteMetric.mutate(m.id)}
                      className="absolute top-3 right-3 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className="font-medium text-sm pr-6">{m.name}</div>
                  {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-2xl font-bold">{m.actualValue.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        of {m.targetValue.toLocaleString()} {m.unit ?? "target"}
                      </div>
                    </div>
                    <Badge variant={m.percentOfTarget >= 100 ? "default" : m.percentOfTarget >= 80 ? "secondary" : "destructive"}>
                      {m.percentOfTarget}%
                    </Badge>
                  </div>
                  <Progress value={Math.min(m.percentOfTarget, 100)} className="h-1.5 mt-3" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Strategic Risks */}
        <SectionCard
          title="Strategic Risk"
          icon={Shield}
          action={showAdminTools && (
            <Button size="sm" variant="outline" onClick={() => setRiskDialog(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add risk
            </Button>
          )}
        >
          <div className="flex gap-3 mb-4 text-xs">
            <span className="flex items-center gap-1"><Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" /> {data.strategicRisks.counts.green} on track</span>
            <span className="flex items-center gap-1"><Circle className="w-2 h-2 fill-amber-400 text-amber-400" /> {data.strategicRisks.counts.yellow} watch</span>
            <span className="flex items-center gap-1"><Circle className="w-2 h-2 fill-red-500 text-red-500" /> {data.strategicRisks.counts.red} action</span>
          </div>
          {data.strategicRisks.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No strategic risks on the register.
              {showAdminTools && " Add risks to give the board a traffic-light view."}
            </p>
          ) : (
            <div className="space-y-3">
              {data.strategicRisks.items.map((risk) => {
                const style = RISK_STYLES[risk.status];
                return (
                  <div key={risk.id} className={cn("rounded-lg border p-4 flex gap-3", style.bg)}>
                    <div className={cn("w-3 h-3 rounded-full mt-1 shrink-0", style.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{risk.title}</div>
                          <Badge variant="outline" className="mt-1 text-[10px]">{style.label}</Badge>
                        </div>
                        {showAdminTools && (
                          <button onClick={() => deleteRisk.mutate(risk.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {risk.description && <p className="text-sm text-muted-foreground mt-2">{risk.description}</p>}
                      {risk.mitigation && (
                        <p className="text-xs mt-2"><span className="font-medium">Mitigation:</span> {risk.mitigation}</p>
                      )}
                      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                        {risk.ownerName && <span>Owner: {risk.ownerName}</span>}
                        {risk.reviewDate && <span>Review: {format(parseISO(risk.reviewDate), "MMM d, yyyy")}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Committee Updates */}
        <SectionCard
          title="Committee Updates"
          icon={Users}
          action={showAdminTools && (
            <Button size="sm" variant="outline" onClick={() => setCommitteeDialog(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Post update
            </Button>
          )}
        >
          {data.committeeUpdates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No committee updates yet.
              {showAdminTools && " Publish notes from finance, audit, or governance committees."}
            </p>
          ) : (
            <div className="space-y-4">
              {data.committeeUpdates.map((u) => (
                <article key={u.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="secondary" className="text-[10px] mb-2">
                        {COMMITTEE_LABELS[u.committeeType]}
                      </Badge>
                      <h3 className="font-medium">{u.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {u.authorName}
                        {u.meetingDate && ` · ${format(parseISO(u.meetingDate), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {showAdminTools && !u.isPublished && (
                        <Badge variant="outline" className="text-[10px]">Draft</Badge>
                      )}
                      {showAdminTools && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => togglePublish.mutate({ id: u.id, isPublished: !u.isPublished })}
                          >
                            {u.isPublished ? "Unpublish" : "Publish"}
                          </Button>
                          <button onClick={() => deleteCommittee.mutate(u.id)} className="text-muted-foreground hover:text-destructive p-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{u.body}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        {!isAdmin && (
          <p className="text-xs text-center text-muted-foreground pb-4">
            This is a read-only board view. Contact your administrator to update metrics, risks, or committee notes.
          </p>
        )}
      </div>

      {/* Admin dialogs */}
      <MetricFormDialog
        open={metricDialog}
        onClose={() => setMetricDialog(false)}
        period={data.period}
        onSubmit={(body) => createMetric.mutate(body)}
        pending={createMetric.isPending}
      />
      <RiskFormDialog
        open={riskDialog}
        onClose={() => setRiskDialog(false)}
        onSubmit={(body) => createRisk.mutate(body)}
        pending={createRisk.isPending}
      />
      <CommitteeFormDialog
        open={committeeDialog}
        onClose={() => setCommitteeDialog(false)}
        onSubmit={(body) => createCommittee.mutate(body)}
        pending={createCommittee.isPending}
      />
    </AppLayout>
  );
}

function MetricFormDialog({ open, onClose, period, onSubmit, pending }: {
  open: boolean; onClose: () => void;
  period: { year: number; quarter: number };
  onSubmit: (body: unknown) => void; pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add program metric</DialogTitle></DialogHeader>
        <form
          className="space-y-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              name: fd.get("name"),
              description: fd.get("description") || null,
              periodYear: period.year,
              periodQuarter: period.quarter,
              targetValue: parseFloat(fd.get("targetValue") as string) || 0,
              actualValue: parseFloat(fd.get("actualValue") as string) || 0,
              unit: fd.get("unit") || null,
            });
          }}
        >
          <Input name="name" required placeholder="Metric name (e.g. Families served)" />
          <Input name="description" placeholder="Description (optional)" />
          <div className="grid grid-cols-2 gap-2">
            <Input name="targetValue" type="number" min="0" step="0.01" required placeholder="Target" />
            <Input name="actualValue" type="number" min="0" step="0.01" required placeholder="Actual YTD" />
          </div>
          <Input name="unit" placeholder="Unit (e.g. families, sessions)" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add metric"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RiskFormDialog({ open, onClose, onSubmit, pending }: {
  open: boolean; onClose: () => void;
  onSubmit: (body: unknown) => void; pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add strategic risk</DialogTitle></DialogHeader>
        <form
          className="space-y-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              title: fd.get("title"),
              description: fd.get("description") || null,
              status: fd.get("status"),
              ownerName: fd.get("ownerName") || null,
              reviewDate: fd.get("reviewDate") || null,
              mitigation: fd.get("mitigation") || null,
            });
          }}
        >
          <Input name="title" required placeholder="Risk title" />
          <textarea name="description" placeholder="Description" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <select name="status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="YELLOW">
            <option value="GREEN">Green — On track</option>
            <option value="YELLOW">Yellow — Watch</option>
            <option value="RED">Red — Action needed</option>
          </select>
          <Input name="ownerName" placeholder="Risk owner" />
          <Input name="reviewDate" type="date" placeholder="Next review date" />
          <textarea name="mitigation" placeholder="Mitigation plan" className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add risk"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommitteeFormDialog({ open, onClose, onSubmit, pending }: {
  open: boolean; onClose: () => void;
  onSubmit: (body: unknown) => void; pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Post committee update</DialogTitle></DialogHeader>
        <form
          className="space-y-3 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSubmit({
              committeeType: fd.get("committeeType"),
              title: fd.get("title"),
              body: fd.get("body"),
              meetingDate: fd.get("meetingDate") || null,
              isPublished: fd.get("isPublished") === "on",
            });
          }}
        >
          <select name="committeeType" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {Object.entries(COMMITTEE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v} Committee</option>
            ))}
          </select>
          <Input name="title" required placeholder="Update title" />
          <Input name="meetingDate" type="date" />
          <textarea name="body" required placeholder="Summary for the board…" className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPublished" defaultChecked className="rounded" />
            Publish to board members immediately
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Posting…" : "Post update"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
