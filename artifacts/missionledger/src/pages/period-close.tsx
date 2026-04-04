import React, { useState, useEffect, useCallback } from "react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, getYear, getMonth } from "date-fns";
import {
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, CalendarCheck,
  RefreshCw, ChevronRight, ChevronLeft, ClipboardCheck, FileText,
  TrendingUp, Shield, History, Info, ArrowRight, Loader2,
  BadgeCheck, AlertCircle, BookOpen,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("ml_token");
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface HealthCheck {
  ok: boolean;
  label: string;
  detail: string;
  count?: number;
  totalDebits?: number;
  totalCredits?: number;
}
interface HealthResult {
  checks: {
    reconciliation: HealthCheck;
    uncategorized: HealthCheck;
    trialBalance: HealthCheck;
  };
  allClear: boolean;
}
interface CloseStatus {
  closedUntil: string | null;
  fiscalYearEndMonth: number;
  snapshots: Snapshot[];
}
interface Snapshot {
  id: string;
  snapshotType: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  closedBy: string;
  closedByEmail: string | null;
  createdAt: string;
}
interface AuditLog {
  id: string;
  action: string;
  description: string;
  userEmail: string | null;
  createdAt: string;
}

type WizardStep = "dashboard" | "health" | "configure" | "confirm" | "results";
type CloseType = "monthly" | "year-end";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function getAvailableMonths(fiscalYearEndMonth: number): Array<{ year: number; month: number; label: string }> {
  const months: Array<{ year: number; month: number; label: string }> = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = subMonths(today, i);
    months.push({
      year: getYear(d),
      month: getMonth(d) + 1,
      label: format(d, "MMMM yyyy"),
    });
  }
  return months.reverse().slice(0, 13);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckRow({ check, loading }: { check: HealthCheck | null; loading: boolean }) {
  if (loading || !check) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <div className="flex-1 h-4 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-lg border transition-colors",
      check.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
    )}>
      {check.ok
        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        : <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
      <div>
        <p className={cn("font-semibold text-sm", check.ok ? "text-emerald-800" : "text-red-800")}>
          {check.label}
        </p>
        <p className={cn("text-xs mt-0.5", check.ok ? "text-emerald-700" : "text-red-700")}>
          {check.detail}
        </p>
      </div>
    </div>
  );
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
              i < current
                ? "bg-[hsl(210,60%,25%)] border-[hsl(210,60%,25%)] text-white"
                : i === current
                  ? "border-[hsl(210,60%,25%)] text-[hsl(210,60%,25%)] bg-white"
                  : "border-muted-foreground/30 text-muted-foreground bg-white"
            )}>
              {i < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              "text-[10px] font-medium mt-1 whitespace-nowrap",
              i === current ? "text-[hsl(210,60%,25%)]" : "text-muted-foreground"
            )}>{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 mx-1 mb-5",
              i < current ? "bg-[hsl(210,60%,25%)]" : "bg-muted-foreground/20"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function SnapshotTypeIcon({ type }: { type: string }) {
  if (type === "STATEMENT_OF_ACTIVITIES") return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  if (type === "BALANCE_SHEET") return <BookOpen className="h-4 w-4 text-blue-600" />;
  if (type === "YEAR_END_CLOSE") return <CalendarCheck className="h-4 w-4 text-violet-600" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

function SnapshotTypeName(type: string) {
  const map: Record<string, string> = {
    STATEMENT_OF_ACTIVITIES: "Statement of Activities",
    BALANCE_SHEET: "Statement of Financial Position",
    PERIOD_CLOSE: "Period Close Record",
    YEAR_END_CLOSE: "Year-End Close Package",
  };
  return map[type] ?? type;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PeriodClosePage() {
  const [status, setStatus] = useState<CloseStatus | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [step, setStep] = useState<WizardStep>("dashboard");
  const [closeType, setCloseType] = useState<CloseType>("monthly");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [overrideChecks, setOverrideChecks] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [closeResult, setCloseResult] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("");

  // Init defaults
  useEffect(() => {
    const today = new Date();
    setSelectedYear(String(today.getFullYear()));
    setSelectedMonth(String(today.getMonth() + 1).padStart(2, "0"));
  }, []);

  const loadStatus = useCallback(async () => {
    const r = await api(`${BASE}api/period-close/status`);
    if (r.ok) setStatus(await r.json());
    const ur = await api(`${BASE}api/users/me`);
    if (ur.ok) {
      const u = await ur.json();
      setUserRole(u.role ?? "");
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    const r = await api(`${BASE}api/period-close/audit-log`);
    if (r.ok) setAuditLog(await r.json());
  }, []);

  useEffect(() => {
    loadStatus();
    loadAuditLog();
  }, [loadStatus, loadAuditLog]);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealth(null);
    try {
      const year = parseInt(selectedYear, 10);
      const month = parseInt(selectedMonth, 10);
      const d = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      const r = await api(`${BASE}api/period-close/health-check?closingDate=${d.toISOString()}`);
      if (r.ok) setHealth(await r.json());
    } finally {
      setHealthLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  const handleStartWizard = () => {
    setStep("health");
    setHealth(null);
  };

  const handleRunHealthCheck = async () => {
    await runHealthCheck();
  };

  const handleClosePeriod = async () => {
    setLoading(true);
    try {
      const endpoint = closeType === "year-end"
        ? `${BASE}api/period-close/year-end-close`
        : `${BASE}api/period-close/close-period`;

      const body = closeType === "year-end"
        ? { year: parseInt(selectedYear, 10), overrideChecks }
        : { year: parseInt(selectedYear, 10), month: parseInt(selectedMonth, 10), overrideChecks };

      const r = await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Failed to close period");
        return;
      }
      setCloseResult(data);
      setStep("results");
      await loadStatus();
      await loadAuditLog();
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async () => {
    if (reopenReason.trim().length < 10) {
      toast.error("Please enter a reason of at least 10 characters");
      return;
    }
    setLoading(true);
    try {
      const r = await api(`${BASE}api/period-close/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reopenReason }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Failed to reopen period");
        return;
      }
      toast.success("Period reopened. Transactions are now editable.");
      setShowReopen(false);
      setReopenReason("");
      setStep("dashboard");
      await loadStatus();
      await loadAuditLog();
    } finally {
      setLoading(false);
    }
  };

  const isFiscalYearEnd = status
    ? parseInt(selectedMonth, 10) === status.fiscalYearEndMonth
    : parseInt(selectedMonth, 10) === 12;

  const months = status ? getAvailableMonths(status.fiscalYearEndMonth) : getAvailableMonths(12);
  const availableYears = [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2,
  ];

  const periodLabel = closeType === "year-end"
    ? `Fiscal Year ${selectedYear}`
    : months.find(m => m.year === parseInt(selectedYear) && m.month === parseInt(selectedMonth, 10))?.label ?? `${selectedMonth}/${selectedYear}`;

  const closedDate = status?.closedUntil
    ? format(parseISO(status.closedUntil), "MMMM d, yyyy")
    : null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-[hsl(210,60%,25%)]/10 rounded-lg">
              <CalendarCheck className="h-6 w-6 text-[hsl(210,60%,25%)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Period & Year-End Close</h1>
              <p className="text-sm text-muted-foreground">Lock periods, generate financial statements, and reset for the new year</p>
            </div>
          </div>
        </div>

        {/* ── Current Lock Status Banner ── */}
        {status?.closedUntil && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <Lock className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm">Period Locked Through {closedDate}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Transactions on or before this date cannot be edited or deleted.
              </p>
            </div>
            {userRole === "MASTER_ADMIN" && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                onClick={() => setShowReopen(true)}
              >
                <Unlock className="h-4 w-4 mr-1" /> Reopen
              </Button>
            )}
          </div>
        )}

        {/* ── Dashboard Step ── */}
        {step === "dashboard" && (
          <div className="space-y-6">
            {/* Action Card */}
            <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
              <div className="p-6">
                <h2 className="font-semibold text-lg text-foreground mb-1">Close a Period</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Run the pre-close health check, then lock a month or the full fiscal year.
                  A finalized snapshot of your financial statements will be saved automatically.
                </p>
                <Button
                  onClick={handleStartWizard}
                  className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Start Close Wizard
                </Button>
              </div>
              <div className="grid grid-cols-3 divide-x border-t bg-muted/30">
                {[
                  { icon: ClipboardCheck, label: "Health Check", desc: "Automated pre-close audit" },
                  { icon: Lock, label: "Period Lock", desc: "Soft or hard close" },
                  { icon: FileText, label: "Statements", desc: "Finalized snapshots saved" },
                ].map((item) => (
                  <div key={item.label} className="p-4 flex flex-col items-center text-center gap-1">
                    <item.icon className="h-5 w-5 text-[hsl(174,60%,40%)]" />
                    <span className="text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Snapshots */}
            {status?.snapshots && status.snapshots.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Finalized Statements
                </h3>
                <div className="space-y-2">
                  {status.snapshots.slice(-6).reverse().map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white text-sm">
                      <SnapshotTypeIcon type={s.snapshotType} />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">{SnapshotTypeName(s.snapshotType)}</span>
                        <span className="text-muted-foreground ml-2">·</span>
                        <span className="text-muted-foreground ml-2">{s.periodLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        <div>{s.closedByEmail ?? s.closedBy}</div>
                        <div>{format(parseISO(s.createdAt), "MM/dd/yyyy")}</div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <BadgeCheck className="h-3 w-3" /> Finalized
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit Log */}
            {auditLog.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Audit Trail
                </h3>
                <div className="space-y-2">
                  {auditLog.slice(-5).reverse().map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white text-sm">
                      <div className={cn(
                        "w-2 h-2 rounded-full mt-1.5 shrink-0",
                        log.action === "PERIOD_REOPEN" ? "bg-amber-500" : "bg-[hsl(174,60%,40%)]"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-xs">{log.description}</p>
                        <p className="text-muted-foreground text-[11px] mt-0.5">
                          {log.userEmail} · {format(parseISO(log.createdAt), "MM/dd/yyyy h:mm a")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Health Check ── */}
        {step === "health" && (
          <div>
            <StepIndicator steps={["Health Check", "Configure", "Confirm", "Done"]} current={0} />

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck className="h-5 w-5 text-[hsl(210,60%,25%)]" />
                <h2 className="font-semibold text-lg text-foreground">Pre-Close Health Check</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Select the period you want to close, then run the automated check.
                All three checks should pass before proceeding.
              </p>

              {/* Period selector in health step */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <Label className="text-xs">Year</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Month</Label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i + 1;
                        return (
                          <SelectItem key={m} value={String(m).padStart(2, "0")}>
                            {new Date(2000, i).toLocaleString("en-US", { month: "long" })}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleRunHealthCheck}
                disabled={healthLoading}
                className="w-full bg-[hsl(174,60%,40%)] hover:bg-[hsl(174,60%,35%)] text-white mb-5"
              >
                {healthLoading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running checks…</>
                  : <><RefreshCw className="h-4 w-4 mr-2" /> Run Health Check</>
                }
              </Button>

              <div className="space-y-3">
                <CheckRow check={health?.checks.reconciliation ?? null} loading={healthLoading} />
                <CheckRow check={health?.checks.uncategorized ?? null} loading={healthLoading} />
                <CheckRow check={health?.checks.trialBalance ?? null} loading={healthLoading} />
              </div>

              {health && !health.allClear && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Issues Detected</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      You can still proceed, but the override option on the confirm step will be required.
                      We recommend fixing these issues first.
                    </p>
                  </div>
                </div>
              )}

              {health?.allClear && (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-800">All checks passed — ready to close</p>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep("dashboard")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setStep("configure")}
                disabled={!health}
                className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
              >
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ── */}
        {step === "configure" && (
          <div>
            <StepIndicator steps={["Health Check", "Configure", "Confirm", "Done"]} current={1} />

            <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
              <div>
                <h2 className="font-semibold text-lg text-foreground mb-1">Configure the Close</h2>
                <p className="text-sm text-muted-foreground">Choose between a soft monthly close or a full year-end hard reset.</p>
              </div>

              {/* Close Type selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCloseType("monthly")}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    closeType === "monthly"
                      ? "border-[hsl(210,60%,25%)] bg-[hsl(210,60%,25%)]/5"
                      : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  <Lock className={cn("h-5 w-5 mb-2", closeType === "monthly" ? "text-[hsl(210,60%,25%)]" : "text-muted-foreground")} />
                  <p className="font-semibold text-sm text-foreground">Monthly / Period Close</p>
                  <p className="text-xs text-muted-foreground mt-1">Soft lock. Freezes the period, generates statements. Income/expense accounts remain open.</p>
                </button>
                <button
                  onClick={() => isFiscalYearEnd && setCloseType("year-end")}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    closeType === "year-end"
                      ? "border-[hsl(210,60%,25%)] bg-[hsl(210,60%,25%)]/5"
                      : "border-border",
                    !isFiscalYearEnd && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <CalendarCheck className={cn("h-5 w-5 mb-2", closeType === "year-end" ? "text-[hsl(210,60%,25%)]" : "text-muted-foreground")} />
                  <p className="font-semibold text-sm text-foreground">Year-End Close</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isFiscalYearEnd
                      ? "Hard reset. Zeros out income & expense accounts. Transfers net income to retained earnings."
                      : `Only available in the last month of the fiscal year (Month ${status?.fiscalYearEndMonth ?? 12}).`}
                  </p>
                </button>
              </div>

              {/* Period display */}
              <div className="p-4 rounded-lg bg-muted/40 border">
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Closing period:</span>
                  <span className="font-semibold text-foreground">{periodLabel}</span>
                </div>
                {closeType === "year-end" && (
                  <p className="text-xs text-amber-600 mt-2 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    This will generate a multi-line closing journal entry debiting all income accounts
                    and crediting all expense accounts, with the net income offset to Retained Earnings.
                    This cannot be undone without reopening the period and voiding the closing entry.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep("health")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setStep("confirm")}
                className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
              >
                Review & Confirm <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === "confirm" && (
          <div>
            <StepIndicator steps={["Health Check", "Configure", "Confirm", "Done"]} current={2} />

            <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
              <div>
                <h2 className="font-semibold text-lg text-foreground">Review & Confirm</h2>
                <p className="text-sm text-muted-foreground">Please review what will happen before proceeding.</p>
              </div>

              {/* Summary */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Lock className="h-4 w-4 text-[hsl(210,60%,25%)] shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Period lock applied through <strong>{periodLabel}</strong></p>
                    <p className="text-xs text-muted-foreground">Transactions in this period will become read-only</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <FileText className="h-4 w-4 text-[hsl(174,60%,40%)] shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Financial statements generated and saved</p>
                    <p className="text-xs text-muted-foreground">
                      {closeType === "year-end"
                        ? "Year-End Close Package (Statement of Activities + Balance Sheet)"
                        : "Statement of Activities + Statement of Financial Position"}
                    </p>
                  </div>
                </div>
                {closeType === "year-end" && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-amber-50 border-amber-200">
                    <CalendarCheck className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Closing journal entry will be posted</p>
                      <p className="text-xs text-amber-700">
                        All income (4000s) and expense (8000s) accounts will be zeroed out.
                        Net income offset to Retained Earnings / Fund Balance.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Health check summary */}
              {health && !health.allClear && (
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-amber-800">Health check issues detected</p>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideChecks}
                      onChange={(e) => setOverrideChecks(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-amber-700">
                      I understand there are outstanding issues and wish to proceed anyway.
                      This may result in incomplete financial statements.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep("configure")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleClosePeriod}
                disabled={loading || (!health?.allClear && !overrideChecks)}
                className={cn(
                  "text-white",
                  closeType === "year-end"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)]"
                )}
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing…</>
                  : closeType === "year-end"
                    ? <><CalendarCheck className="h-4 w-4 mr-2" /> Execute Year-End Close</>
                    : <><Lock className="h-4 w-4 mr-2" /> Close {periodLabel}</>
                }
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Results ── */}
        {step === "results" && closeResult && (
          <div>
            <StepIndicator steps={["Health Check", "Configure", "Confirm", "Done"]} current={3} />

            <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="font-bold text-xl text-foreground">Period Closed Successfully</h2>
                <p className="text-sm text-muted-foreground mt-1">{closeResult.periodLabel}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <p className="text-xs text-muted-foreground">Locked Through</p>
                  <p className="font-bold text-foreground text-sm mt-1">
                    {closeResult.closedUntil
                      ? format(new Date(closeResult.closedUntil), "MMM d, yyyy")
                      : "—"}
                  </p>
                </div>
                {closeResult.netIncome !== undefined && (
                  <div className="p-3 rounded-lg bg-muted/30 border text-center">
                    <p className="text-xs text-muted-foreground">Net Income Transferred</p>
                    <p className={cn(
                      "font-bold text-sm mt-1",
                      closeResult.netIncome >= 0 ? "text-emerald-700" : "text-red-600"
                    )}>
                      {fmt(closeResult.netIncome)}
                    </p>
                  </div>
                )}
              </div>

              {closeResult.closingEntry && (
                <div className="p-3 rounded-lg border bg-violet-50 border-violet-200">
                  <p className="text-sm font-semibold text-violet-800 flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    Closing Journal Entry Posted
                  </p>
                  <p className="text-xs text-violet-700 mt-1">
                    Entry #{closeResult.closingEntry.entryNumber} · {closeResult.closingEntry.lineCount} lines ·
                    {closeResult.incomeAccountsClosed} income accounts + {closeResult.expenseAccountsClosed} expense accounts zeroed
                  </p>
                  <p className="text-xs text-violet-700 mt-0.5">
                    Net income offset to: <strong>{closeResult.retainedEarningsAccount}</strong>
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Saved Financial Statements
                </p>
                <div className="space-y-2">
                  {(closeResult.snapshots ?? ["STATEMENT_OF_ACTIVITIES", "BALANCE_SHEET"]).map((type: string) => (
                    <div key={type} className="flex items-center gap-2 p-2.5 rounded-lg border bg-white text-sm">
                      <SnapshotTypeIcon type={type} />
                      <span className="font-medium text-foreground">{SnapshotTypeName(type)}</span>
                      <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                        Finalized
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-6">
              <Button
                onClick={() => setStep("dashboard")}
                className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* ── Reopen Modal ── */}
        {showReopen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Unlock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Reopen Closed Period</h3>
                  <p className="text-xs text-muted-foreground">This action will be logged in the audit trail</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Period currently locked through:</strong> {closedDate}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Reopening will allow editing of transactions in this period.
                  Your name, the timestamp, and the reason will be recorded permanently.
                </p>
              </div>

              <div className="mb-4">
                <Label className="text-xs font-semibold">Reason for Reopening *</Label>
                <Textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Correcting a misposted transaction discovered during audit review…"
                  rows={3}
                  className="mt-1 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Minimum 10 characters required</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setShowReopen(false); setReopenReason(""); }}>
                  Cancel
                </Button>
                <Button
                  onClick={handleReopen}
                  disabled={loading || reopenReason.trim().length < 10}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reopen Period"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
