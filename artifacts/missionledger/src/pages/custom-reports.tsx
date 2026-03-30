import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  Play, Save, Trash2, FileDown, Download, ChevronDown, ChevronRight,
  BarChart2, TrendingUp, Layers, Scale, BookMarked, Loader2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BASE = import.meta.env.BASE_URL as string;

function authHeaders(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const token = localStorage.getItem("ml_token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = "account_activity" | "income_expense" | "fund_breakdown" | "balance_summary";
type GroupBy    = "none" | "month" | "quarter";

interface ReportConfig {
  reportType:   ReportType;
  accountIds:   string[];        // empty = all
  accountTypes: string[];        // empty = all
  startDate:    string;
  endDate:      string;
  asOfDate:     string;
  groupBy:      GroupBy;
  fundId:       string;          // "all" or specific
}

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "account_activity",  label: "Account Activity",  icon: <BarChart2 className="w-4 h-4" />, desc: "Debits & credits per account over a period" },
  { value: "income_expense",    label: "Income vs Expense", icon: <TrendingUp className="w-4 h-4" />, desc: "Revenue, expenses, and net surplus" },
  { value: "fund_breakdown",    label: "Fund Breakdown",    icon: <Layers className="w-4 h-4" />, desc: "Activity grouped by fund" },
  { value: "balance_summary",   label: "Balance Summary",   icon: <Scale className="w-4 h-4" />, desc: "Asset, liability & equity as of a date" },
];

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const TYPE_LABELS: Record<string, string> = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense" };
const TYPE_COLORS: Record<string, string> = {
  ASSET:     "text-blue-700",
  LIABILITY: "text-red-700",
  EQUITY:    "text-purple-700",
  INCOME:    "text-emerald-700",
  EXPENSE:   "text-amber-700",
};

function fmtPeriod(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const year = new Date().getFullYear();
const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

const DEFAULT_CONFIG: ReportConfig = {
  reportType:   "account_activity",
  accountIds:   [],
  accountTypes: [],
  startDate:    `${year}-01-01`,
  endDate:      `${year}-12-31`,
  asOfDate:     todayStr,
  groupBy:      "none",
  fundId:       "all",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CustomReportsPage() {
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<CoaAccount[]>([]);
  const [funds, setFunds] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [accountsExpanded, setAccountsExpanded] = useState(false);

  // Load chart of accounts, funds, and templates
  useEffect(() => {
    const headers = authHeaders();
    fetch(`${BASE}api/chart-of-accounts`, { credentials: "include", headers })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        const list = d?.data ?? d;
        return Array.isArray(list) ? list : [];
      })
      .then((list: any[]) => setAccounts(list.filter((a: any) => a.isActive !== false)))
      .catch(() => {});

    fetch(`${BASE}api/funds`, { credentials: "include", headers })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        const list = d?.data ?? d;
        return Array.isArray(list) ? list : [];
      })
      .then((list: any[]) => setFunds(list))
      .catch(() => {});
    loadTemplates();
  }, []);

  function loadTemplates() {
    const headers = authHeaders();
    fetch(`${BASE}api/custom-reports/templates`, { credentials: "include", headers })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        const list = d?.data ?? d;
        return Array.isArray(list) ? list : [];
      })
      .then((list: any[]) => setTemplates(list))
      .catch(() => setTemplates([]));
  }

  function setField<K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  function toggleAccountType(type: string) {
    setConfig(prev => ({
      ...prev,
      accountTypes: prev.accountTypes.includes(type)
        ? prev.accountTypes.filter(t => t !== type)
        : [...prev.accountTypes, type],
    }));
  }

  function toggleAccount(id: string) {
    setConfig(prev => ({
      ...prev,
      accountIds: prev.accountIds.includes(id)
        ? prev.accountIds.filter(a => a !== id)
        : [...prev.accountIds, id],
    }));
  }

  const handleRun = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const headers = authHeaders();
      const res = await fetch(`${BASE}api/custom-reports/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run report");
      setResult(data);
    } catch (err: any) {
      toast.error(err.message || "Report failed");
    } finally {
      setLoading(false);
    }
  }, [config]);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) { toast.error("Enter a template name"); return; }
    setSavingTemplate(true);
    try {
      const headers = authHeaders();
      const res = await fetch(`${BASE}api/custom-reports/templates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ name: templateName.trim(), config }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Template saved");
      setTemplateName("");
      loadTemplates();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const headers = authHeaders();
    await fetch(`${BASE}api/custom-reports/templates/${id}`, { method: "DELETE", credentials: "include", headers });
    loadTemplates();
  };

  const loadTemplate = (tmpl: any) => {
    try {
      const cfg = typeof tmpl.config === "string" ? JSON.parse(tmpl.config) : tmpl.config;
      setConfig({ ...DEFAULT_CONFIG, ...cfg });
      toast.success(`Loaded "${tmpl.name}"`);
    } catch { toast.error("Could not load template"); }
  };

  // Accounts visible in the picker (filtered by selected types if any)
  const visibleAccounts = config.accountTypes.length > 0
    ? accounts.filter(a => config.accountTypes.includes(a.type))
    : accounts;

  const accountsByType = ACCOUNT_TYPES.reduce((map, t) => {
    const list = visibleAccounts.filter(a => a.type === t);
    if (list.length > 0) map[t] = list;
    return map;
  }, {} as Record<string, CoaAccount[]>);

  // Export CSV
  const handleExportCsv = () => {
    if (!result) return;
    const rows = buildFlatRows(result);
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r as any)[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custom-report-${config.reportType}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF
  const handleExportPdf = () => {
    if (!result) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const title = REPORT_TYPES.find(t => t.value === config.reportType)?.label || "Custom Report";
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    const period = result.asOfDate
      ? `As of ${formatDate(result.asOfDate)}`
      : `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
    doc.text(period, 14, 26);
    doc.setTextColor(0);

    const rows = buildFlatRows(result);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      autoTable(doc, {
        startY: 32,
        head: [headers],
        body: rows.map(r => headers.map(h => (r as any)[h] ?? "")),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 64, 120] },
      });
    }
    doc.save(`custom-report-${config.reportType}.pdf`);
  };

  return (
    <AppLayout title="Custom Report Builder">
      <div className="flex flex-col lg:flex-row gap-6 min-h-0">

        {/* ── Left: Config Panel ──────────────────────────────────────────── */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">

          {/* Report Type */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Report Type</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1">
              {REPORT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setField("reportType", t.value)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    config.reportType === t.value
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{t.icon}</span>
                  <span>
                    <p className="text-sm font-medium leading-tight">{t.label}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{t.desc}</p>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Date Range */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {config.reportType === "balance_summary" ? "As of Date" : "Date Range"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {config.reportType === "balance_summary" ? (
                <Input type="date" value={config.asOfDate} onChange={e => setField("asOfDate", e.target.value)} className="h-8 text-sm" />
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Start</label>
                    <Input type="date" value={config.startDate} onChange={e => setField("startDate", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">End</label>
                    <Input type="date" value={config.endDate} onChange={e => setField("endDate", e.target.value)} className="h-8 text-sm" />
                  </div>
                  {/* Quick presets */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      { l: "YTD",    s: `${year}-01-01`, e: todayStr },
                      { l: "This Year", s: `${year}-01-01`, e: `${year}-12-31` },
                      { l: "Last Year", s: `${year - 1}-01-01`, e: `${year - 1}-12-31` },
                      { l: "Q1", s: `${year}-01-01`, e: `${year}-03-31` },
                      { l: "Q2", s: `${year}-04-01`, e: `${year}-06-30` },
                      { l: "Q3", s: `${year}-07-01`, e: `${year}-09-30` },
                      { l: "Q4", s: `${year}-10-01`, e: `${year}-12-31` },
                    ].map(p => (
                      <button key={p.l}
                        onClick={() => { setField("startDate", p.s); setField("endDate", p.e); }}
                        className="px-2 py-0.5 text-xs rounded border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                      >{p.l}</button>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Filters</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {/* Account Types */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Account Types</p>
                <div className="flex flex-wrap gap-1.5">
                  {(config.reportType === "balance_summary"
                    ? ["ASSET", "LIABILITY", "EQUITY"]
                    : config.reportType === "income_expense"
                    ? ["INCOME", "EXPENSE"]
                    : ACCOUNT_TYPES
                  ).map(t => (
                    <button key={t}
                      onClick={() => toggleAccountType(t)}
                      className={`px-2 py-0.5 text-xs rounded-full border font-medium transition-colors ${
                        config.accountTypes.includes(t)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >{TYPE_LABELS[t]}</button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">No selection = all types</p>
              </div>

              {/* Fund */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Fund</p>
                <select
                  value={config.fundId}
                  onChange={e => setField("fundId", e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All Funds</option>
                  {funds.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Group By — not for balance summary */}
              {config.reportType !== "balance_summary" && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Group By</p>
                  <div className="flex gap-1.5">
                    {(["none", "month", "quarter"] as GroupBy[]).map(g => (
                      <button key={g}
                        onClick={() => setField("groupBy", g)}
                        className={`flex-1 py-1 text-xs rounded-md border font-medium transition-colors ${
                          config.groupBy === g
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                        }`}
                      >{g === "none" ? "Total" : g.charAt(0).toUpperCase() + g.slice(1)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Specific Accounts (collapsible) */}
              <div>
                <button
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setAccountsExpanded(v => !v)}
                >
                  {accountsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Specific Accounts
                  {config.accountIds.length > 0 && (
                    <span className="ml-1 bg-primary/10 text-primary text-xs px-1.5 rounded-full font-semibold">{config.accountIds.length}</span>
                  )}
                </button>
                {accountsExpanded && (
                  <div className="mt-2 border border-border rounded-md max-h-48 overflow-y-auto">
                    {config.accountIds.length > 0 && (
                      <button
                        onClick={() => setField("accountIds", [])}
                        className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1 text-left border-b border-border"
                      >Clear selection</button>
                    )}
                    {Object.entries(accountsByType).map(([type, accs]) => (
                      <div key={type}>
                        <p className={`px-2 py-0.5 text-xs font-semibold bg-muted ${TYPE_COLORS[type]}`}>{TYPE_LABELS[type]}</p>
                        {accs.map(a => (
                          <label key={a.id} className="flex items-center gap-2 px-2 py-1 hover:bg-muted cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.accountIds.includes(a.id)}
                              onChange={() => toggleAccount(a.id)}
                              className="h-3 w-3 rounded"
                            />
                            <span className="text-xs text-muted-foreground">{a.code}</span>
                            <span className="text-xs truncate">{a.name}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {Object.keys(accountsByType).length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No accounts match the selected types</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Run */}
          <Button className="w-full gap-2" onClick={handleRun} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? "Running…" : "Run Report"}
          </Button>

          {/* Save Template */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Save as Template</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Input
                placeholder="Template name…"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveTemplate()}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleSaveTemplate} disabled={savingTemplate}>
                <Save className="w-3.5 h-3.5" />
                {savingTemplate ? "Saving…" : "Save Template"}
              </Button>
            </CardContent>
          </Card>

          {/* Saved Templates */}
          {templates.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <BookMarked className="w-3.5 h-3.5" /> Saved Templates
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3 space-y-0.5">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-1 group rounded-lg px-2 py-1.5 hover:bg-muted">
                    <button
                      onClick={() => loadTemplate(t)}
                      className="flex-1 text-sm text-left truncate hover:text-primary transition-colors"
                    >{t.name}</button>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition"
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Results Panel ────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground text-sm">Running report…</p>
              </div>
            </Card>
          ) : !result ? (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center space-y-3">
                <BarChart2 className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground">Configure a report and click <span className="font-medium text-foreground">Run Report</span></p>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-base">
                      {REPORT_TYPES.find(t => t.value === result.reportType)?.label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {result.asOfDate
                        ? `As of ${formatDate(result.asOfDate)}`
                        : `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`}
                      {config.groupBy !== "none" && ` · Grouped by ${config.groupBy}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
                      <Download className="w-3.5 h-3.5" /> CSV
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPdf}>
                      <FileDown className="w-3.5 h-3.5" /> PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-auto">
                <ResultsView result={result} groupBy={config.groupBy} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────

function ResultsView({ result, groupBy }: { result: any; groupBy: GroupBy }) {
  if (result.reportType === "account_activity") {
    return <AccountActivityResult result={result} groupBy={groupBy} />;
  }
  if (result.reportType === "income_expense") {
    return <IncomeExpenseResult result={result} groupBy={groupBy} />;
  }
  if (result.reportType === "fund_breakdown") {
    return <FundBreakdownResult result={result} />;
  }
  if (result.reportType === "balance_summary") {
    return <BalanceSummaryResult result={result} />;
  }
  return <p className="text-muted-foreground text-sm">Unknown report type.</p>;
}

// ── Account Activity ──────────────────────────────────────────────────────────
function AccountActivityResult({ result, groupBy }: { result: any; groupBy: GroupBy }) {
  const rows: any[] = result.rows || [];
  const hasGroups = groupBy !== "none" && rows.some((r: any) => r.period);

  if (hasGroups) {
    // Group by period → account
    const periods = [...new Set(rows.map((r: any) => r.period as string))].sort();
    const perPeriod = periods.map(p => ({
      period: p,
      rows: rows.filter(r => r.period === p),
    }));
    return (
      <div className="space-y-4">
        {perPeriod.map(({ period, rows: pRows }) => (
          <div key={period}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{fmtPeriod(period)}</h4>
            <ActivityTable rows={pRows} />
          </div>
        ))}
        <SummaryBar label="Grand Total" debit={result.summary.totalDebit} credit={result.summary.totalCredit} net={result.summary.net} />
      </div>
    );
  }

  return (
    <>
      <ActivityTable rows={rows} />
      <SummaryBar label="Total" debit={result.summary.totalDebit} credit={result.summary.totalCredit} net={result.summary.net} />
    </>
  );
}

function ActivityTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4">No activity in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
          <th className="py-1.5 text-left font-medium">Account</th>
          <th className="py-1.5 text-left font-medium">Type</th>
          <th className="py-1.5 text-right font-medium">Debits</th>
          <th className="py-1.5 text-right font-medium">Credits</th>
          <th className="py-1.5 text-right font-medium">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => (
          <tr key={i} className="border-b border-border/40 hover:bg-muted/40">
            <td className="py-2">
              <span className="text-muted-foreground mr-1.5">{r.accountCode}</span>
              {r.accountName}
            </td>
            <td className={`py-2 text-xs font-medium ${TYPE_COLORS[r.accountType] || ""}`}>{TYPE_LABELS[r.accountType] || r.accountType}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(r.totalDebit)}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(r.totalCredit)}</td>
            <td className={`py-2 text-right tabular-nums font-medium ${r.net < 0 ? "text-red-600" : ""}`}>{formatCurrency(r.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Income vs Expense ─────────────────────────────────────────────────────────
function IncomeExpenseResult({ result, groupBy }: { result: any; groupBy: GroupBy }) {
  if (groupBy !== "none" && result.rows) {
    // Grouped rows: show as flat table
    const rows: any[] = result.rows;
    const periods = [...new Set(rows.map((r: any) => r.period as string))].sort();
    const perPeriod = periods.map(p => {
      const pRows = rows.filter(r => r.period === p);
      const revenue  = pRows.filter(r => r.accountType === "INCOME").reduce((s: number, r: any) => s + r.amount, 0);
      const expenses = pRows.filter(r => r.accountType === "EXPENSE").reduce((s: number, r: any) => s + r.amount, 0);
      return { period: p, rows: pRows, revenue, expenses, net: revenue - expenses };
    });
    return (
      <div className="space-y-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              <th className="py-1.5 text-left font-medium">Period</th>
              <th className="py-1.5 text-right font-medium">Revenue</th>
              <th className="py-1.5 text-right font-medium">Expenses</th>
              <th className="py-1.5 text-right font-medium">Net Surplus</th>
            </tr>
          </thead>
          <tbody>
            {perPeriod.map(p => (
              <tr key={p.period} className="border-b border-border/40 hover:bg-muted/40">
                <td className="py-2 font-medium">{fmtPeriod(p.period)}</td>
                <td className="py-2 text-right tabular-nums text-emerald-700">{formatCurrency(p.revenue)}</td>
                <td className="py-2 text-right tabular-nums text-red-700">{formatCurrency(p.expenses)}</td>
                <td className={`py-2 text-right tabular-nums font-semibold ${p.net < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(p.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold text-sm">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums text-emerald-700">{formatCurrency(perPeriod.reduce((s, p) => s + p.revenue, 0))}</td>
              <td className="py-2 text-right tabular-nums text-red-700">{formatCurrency(perPeriod.reduce((s, p) => s + p.expenses, 0))}</td>
              <td className={`py-2 text-right tabular-nums ${perPeriod.reduce((s, p) => s + p.net, 0) < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {formatCurrency(perPeriod.reduce((s, p) => s + p.net, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // Non-grouped: sections
  const revenue  = result.revenue  || [];
  const expenses = result.expenses || [];
  return (
    <div className="space-y-5">
      {/* Revenue */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1.5">Revenue</h4>
        {revenue.length === 0
          ? <p className="text-sm text-muted-foreground">No revenue in this period.</p>
          : <SimpleAmountTable rows={revenue} colorClass="text-emerald-700" />}
        <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border mt-1">
          <span>Total Revenue</span>
          <span className="tabular-nums text-emerald-700">{formatCurrency(result.totalRevenue)}</span>
        </div>
      </div>

      {/* Expenses */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1.5">Expenses</h4>
        {expenses.length === 0
          ? <p className="text-sm text-muted-foreground">No expenses in this period.</p>
          : <SimpleAmountTable rows={expenses} colorClass="text-red-700" />}
        <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border mt-1">
          <span>Total Expenses</span>
          <span className="tabular-nums text-red-700">{formatCurrency(result.totalExpenses)}</span>
        </div>
      </div>

      {/* Net */}
      <div className={`flex justify-between text-base font-bold pt-2 border-t-2 ${result.netSurplus >= 0 ? "text-emerald-700" : "text-red-600"}`}>
        <span>Net Surplus {result.netSurplus < 0 ? "(Deficit)" : ""}</span>
        <span className="tabular-nums">{formatCurrency(Math.abs(result.netSurplus))}</span>
      </div>
    </div>
  );
}

function SimpleAmountTable({ rows, colorClass }: { rows: any[]; colorClass: string }) {
  return (
    <div className="space-y-0.5">
      {rows.map((r: any, i: number) => (
        <div key={i} className="flex justify-between text-sm py-0.5 border-b border-border/30">
          <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
          <span className={`tabular-nums font-medium ${colorClass}`}>{formatCurrency(r.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Fund Breakdown ────────────────────────────────────────────────────────────
function FundBreakdownResult({ result }: { result: any }) {
  const funds: any[] = result.funds || [];
  if (funds.length === 0) return <p className="text-sm text-muted-foreground">No data found.</p>;
  return (
    <div className="space-y-6">
      {funds.map((fund: any) => (
        <div key={fund.fundId}>
          <h4 className="text-sm font-semibold text-foreground mb-1.5 pb-1 border-b border-border">{fund.fundName}</h4>
          <ActivityTable rows={fund.rows} />
          <div className="flex justify-end gap-6 text-xs font-semibold text-muted-foreground mt-1 pt-1 border-t border-border/40">
            <span>Debits: <span className="text-foreground tabular-nums">{formatCurrency(fund.totalDebit)}</span></span>
            <span>Credits: <span className="text-foreground tabular-nums">{formatCurrency(fund.totalCredit)}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Balance Summary ───────────────────────────────────────────────────────────
function BalanceSummaryResult({ result }: { result: any }) {
  return (
    <div className="space-y-5">
      <BalanceSection title="Assets" rows={result.assets} total={result.totalAssets} colorClass="text-blue-700" />
      <BalanceSection title="Liabilities" rows={result.liabilities} total={result.totalLiabilities} colorClass="text-red-700" />
      <BalanceSection title="Equity" rows={result.equity} total={result.totalEquity} colorClass="text-purple-700" />
      <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-border">
        <span>Net Assets</span>
        <span className={`tabular-nums ${result.netAssets < 0 ? "text-red-600" : "text-blue-700"}`}>{formatCurrency(result.netAssets)}</span>
      </div>
    </div>
  );
}

function BalanceSection({ title, rows, total, colorClass }: { title: string; rows: any[]; total: number; colorClass: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${colorClass}`}>{title}</h4>
      <div className="space-y-0.5">
        {rows.map((r: any, i: number) => (
          <div key={i} className="flex justify-between text-sm py-0.5 border-b border-border/30">
            <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
            <span className={`tabular-nums font-medium ${colorClass}`}>{formatCurrency(r.balance)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border mt-1">
        <span>Total {title}</span>
        <span className={`tabular-nums ${colorClass}`}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
function SummaryBar({ label, debit, credit, net }: { label: string; debit: number; credit: number; net: number }) {
  return (
    <div className="flex gap-6 mt-3 pt-3 border-t-2 border-border text-sm font-semibold">
      <span className="text-muted-foreground">{label}:</span>
      <span>Debits <span className="tabular-nums text-foreground">{formatCurrency(debit)}</span></span>
      <span>Credits <span className="tabular-nums text-foreground">{formatCurrency(credit)}</span></span>
      <span className={net < 0 ? "text-red-600" : "text-emerald-700"}>Net <span className="tabular-nums">{formatCurrency(Math.abs(net))}</span></span>
    </div>
  );
}

// ─── Flat Rows for Export ─────────────────────────────────────────────────────
function buildFlatRows(result: any): Record<string, any>[] {
  if (result.reportType === "account_activity") {
    return (result.rows || []).map((r: any) => ({
      ...(r.period ? { Period: fmtPeriod(r.period) } : {}),
      "Account Code": r.accountCode,
      "Account Name": r.accountName,
      Type: TYPE_LABELS[r.accountType] || r.accountType,
      Debits: r.totalDebit,
      Credits: r.totalCredit,
      Net: r.net,
    }));
  }
  if (result.reportType === "income_expense") {
    if (result.rows) {
      return (result.rows || []).map((r: any) => ({
        ...(r.period ? { Period: fmtPeriod(r.period) } : {}),
        "Account Code": r.accountCode,
        "Account Name": r.accountName,
        Type: TYPE_LABELS[r.accountType] || r.accountType,
        Amount: r.amount,
      }));
    }
    const rows: Record<string, any>[] = [];
    for (const r of (result.revenue || [])) rows.push({ Category: "Revenue", "Account Code": r.accountCode, "Account Name": r.accountName, Amount: r.amount });
    for (const r of (result.expenses || [])) rows.push({ Category: "Expense", "Account Code": r.accountCode, "Account Name": r.accountName, Amount: r.amount });
    rows.push({ Category: "NET SURPLUS", "Account Code": "", "Account Name": "", Amount: result.netSurplus });
    return rows;
  }
  if (result.reportType === "fund_breakdown") {
    const rows: Record<string, any>[] = [];
    for (const fund of (result.funds || [])) {
      for (const r of fund.rows) {
        rows.push({ Fund: fund.fundName, "Account Code": r.accountCode, "Account Name": r.accountName, Type: TYPE_LABELS[r.accountType] || r.accountType, Debits: r.totalDebit, Credits: r.totalCredit });
      }
    }
    return rows;
  }
  if (result.reportType === "balance_summary") {
    const rows: Record<string, any>[] = [];
    for (const r of (result.assets || []))      rows.push({ Section: "Assets",      "Account Code": r.accountCode, "Account Name": r.accountName, Balance: r.balance });
    for (const r of (result.liabilities || [])) rows.push({ Section: "Liabilities", "Account Code": r.accountCode, "Account Name": r.accountName, Balance: r.balance });
    for (const r of (result.equity || []))      rows.push({ Section: "Equity",      "Account Code": r.accountCode, "Account Name": r.accountName, Balance: r.balance });
    rows.push({ Section: "NET ASSETS", "Account Code": "", "Account Name": "", Balance: result.netAssets });
    return rows;
  }
  return [];
}
