import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, CheckCircle2, Circle, DollarSign,
  TrendingUp, TrendingDown, ChevronRight, Edit2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function apiErrorMessage(res: Response, body: { error?: string; message?: string } | null): string {
  const msg = body?.message || body?.error;
  if (res.status === 401) return "You are not signed in. Please log in and try again.";
  if (res.status === 403) {
    if (msg === "READ_ONLY_ROLE") return body?.message || "Your role is read-only.";
    if (msg === "Forbidden") return "You don't have permission to manage budgets. An admin role is required.";
  }
  return msg || "Request failed";
}

async function apiGet(path: string) {
  const res = await authJsonFetch(path);
  if (!res.ok) throw new Error(apiErrorMessage(res, await readJsonSafe(res)));
  return res.json();
}

async function apiPost(path: string, body: unknown) {
  const res = await authJsonFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, await readJsonSafe(res)));
  return res.json();
}

async function apiPut(path: string, body: unknown) {
  const res = await authJsonFetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, await readJsonSafe(res)));
  return res.json();
}

async function apiDelete(path: string) {
  const res = await authJsonFetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(apiErrorMessage(res, await readJsonSafe(res)));
  return res.json();
}

function mutationErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

interface BudgetSummary {
  id: string;
  name: string;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  totalBudget: number;
  lineCount: number;
}

interface BudgetMonth {
  key: string;
  label: string;
}

interface BudgetLine {
  id: string;
  accountId: string;
  amount: number;
  monthlyAmounts: number[];
  monthlyActuals: number[];
  actual: number;
  remaining: number;
  percent: number;
  overBudget: boolean;
  account: { id: string; code: string; name: string; type: string } | null;
}

interface BudgetLinesResponse {
  months: BudgetMonth[];
  lines: BudgetLine[];
}

function sumMonthly(values: number[]): number {
  return Math.round(values.reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
}

function emptyMonthly(monthCount: number): string[] {
  return Array(monthCount).fill("0");
}

function MonthlyAmountGrid({
  months,
  values,
  onChange,
  disabled,
}: {
  months: BudgetMonth[];
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const annualTotal = sumMonthly(values.map((v) => parseFloat(v) || 0));

  function setAt(index: number, raw: string) {
    const next = [...values];
    next[index] = raw;
    onChange(next);
  }

  function spreadEvenly(annual: number) {
    if (months.length === 0) return;
    const even = Math.round((annual / months.length) * 100) / 100;
    const next = Array(months.length).fill(String(even));
    const diff = Math.round((annual - even * months.length) * 100) / 100;
    if (diff !== 0) next[months.length - 1] = String(Math.round((even + diff) * 100) / 100);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Enter an amount for each month. The annual total is the sum.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || months.length === 0}
          onClick={() => {
            const current = sumMonthly(values.map((v) => parseFloat(v) || 0));
            spreadEvenly(current > 0 ? current : 0);
          }}
        >
          Spread evenly
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
        {months.map((m, i) => (
          <div key={m.key} className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">{m.label}</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={values[i] ?? "0"}
              disabled={disabled}
              onChange={(e) => setAt(i, e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium text-muted-foreground">Annual total</span>
        <span className="font-semibold">{fmt(annualTotal)}</span>
      </div>
    </div>
  );
}

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
}

export default function BudgetPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<BudgetLine | null>(null);
  const [editMonthly, setEditMonthly] = useState<string[]>([]);
  const [addMonthly, setAddMonthly] = useState<string[]>([]);
  const [showMonthlyGrid, setShowMonthlyGrid] = useState(false);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);

  const { data: budgetList = [], isLoading: loadingList } = useQuery<BudgetSummary[]>({
    queryKey: ["budgets"],
    queryFn: () => apiGet("api/budgets"),
  });

  const selectedBudget = budgetList.find(b => b.id === selectedId) ?? null;

  const { data: lineData, isLoading: loadingLines } = useQuery<BudgetLinesResponse>({
    queryKey: ["budget-lines", selectedId],
    queryFn: () => apiGet(`api/budgets/${selectedId}/lines`),
    enabled: !!selectedId,
  });

  const budgetMonths = lineData?.months ?? [];
  const lines = lineData?.lines ?? [];

  const { data: coaAll = [] } = useQuery<CoaAccount[]>({
    queryKey: ["coa"],
    queryFn: () => apiGet("api/chart-of-accounts"),
    enabled: addLineOpen,
  });

  const usedAccountIds = new Set(lines.map(l => l.accountId));
  const coaOptions = coaAll.filter(c => c.isActive && !usedAccountIds.has(c.id));

  const createBudget = useMutation({
    mutationFn: (body: any) => apiPost("api/budgets", body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setSelectedId(created.id);
      setCreateOpen(false);
      toast.success("Budget created");
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to create budget")),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPut(`api/budgets/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to update")),
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => apiDelete(`api/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      if (deleteBudgetId === selectedId) setSelectedId(null);
      setDeleteBudgetId(null);
      toast.success("Budget deleted");
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to delete")),
  });

  const addLine = useMutation({
    mutationFn: (body: any) => apiPost(`api/budgets/${selectedId}/lines`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setAddLineOpen(false);
      toast.success("Line item added");
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to add line")),
  });

  const updateLine = useMutation({
    mutationFn: ({ lineId, monthlyAmounts }: { lineId: string; monthlyAmounts: number[] }) =>
      apiPut(`api/budgets/${selectedId}/lines/${lineId}`, { monthlyAmounts }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setEditLine(null);
      toast.success("Budget line updated");
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to update")),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => apiDelete(`api/budgets/${selectedId}/lines/${lineId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setDeleteLineId(null);
      toast.success("Line item removed");
    },
    onError: (e: unknown) => toast.error(mutationErrorMessage(e, "Failed to delete")),
  });

  const totalBudgeted = lines.reduce((s, l) => s + l.amount, 0);
  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const totalRemaining = totalBudgeted - totalActual;
  const overallPercent = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createBudget.mutate({
      name: fd.get("name"),
      fiscalYear: parseInt(fd.get("fiscalYear") as string),
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate"),
      isActive: fd.get("isActive") === "on",
    });
  }

  function openAddLine() {
    setAddMonthly(emptyMonthly(budgetMonths.length || 12));
    setAddLineOpen(true);
  }

  function handleAddLineSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const monthlyAmounts = addMonthly.map((v) => parseFloat(v) || 0);
    if (monthlyAmounts.some((v) => v < 0)) {
      toast.error("Monthly amounts cannot be negative");
      return;
    }
    addLine.mutate({
      accountId: fd.get("accountId"),
      monthlyAmounts,
    });
  }

  function startEdit(line: BudgetLine) {
    setEditLine(line);
    setEditMonthly(
      line.monthlyAmounts.length > 0
        ? line.monthlyAmounts.map((v) => String(v))
        : emptyMonthly(budgetMonths.length || 12),
    );
  }

  function saveEdit() {
    if (!editLine) return;
    const monthlyAmounts = editMonthly.map((v) => parseFloat(v) || 0);
    if (monthlyAmounts.some((v) => v < 0)) {
      toast.error("Monthly amounts cannot be negative");
      return;
    }
    updateLine.mutate({ lineId: editLine.id, monthlyAmounts });
  }

  const currentYear = new Date().getFullYear();

  const groupedCoa = coaOptions.reduce<Record<string, CoaAccount[]>>((acc, c) => {
    if (!acc[c.type]) acc[c.type] = [];
    acc[c.type].push(c);
    return acc;
  }, {});

  return (
    <AppLayout title="Budget Manager">
      <div className="flex flex-col lg:flex-row gap-6 h-full">
        {/* ── Left Panel: Budget List ─────────────────────────────────── */}
        <div className="w-full lg:w-72 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Budgets</h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>

          {loadingList && (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          )}

          {!loadingList && budgetList.length === 0 && (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No budgets yet.
              <br />
              <button onClick={() => setCreateOpen(true)} className="text-primary font-medium hover:underline mt-1">Create your first budget</button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {budgetList.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all hover:border-primary/50",
                  selectedId === b.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">FY {b.fiscalYear}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {b.isActive && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">Active</Badge>
                    )}
                    <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", selectedId === b.id && "rotate-90")} />
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold">{fmt(b.totalBudget)}</div>
                <div className="text-xs text-muted-foreground">{b.lineCount} line{b.lineCount !== 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right Panel: Budget Detail ──────────────────────────────── */}
        {!selectedBudget ? (
          <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed text-center p-12">
            <div>
              <DollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Select a budget to view and edit its line items</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Budget Header */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold">{selectedBudget.name}</h2>
                    {selectedBudget.isActive && <Badge>Active</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    FY {selectedBudget.fiscalYear} &bull;{" "}
                    {new Date(selectedBudget.startDate).toLocaleDateString()} – {new Date(selectedBudget.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive.mutate({ id: selectedBudget.id, isActive: !selectedBudget.isActive })}
                    disabled={toggleActive.isPending}
                  >
                    {selectedBudget.isActive ? (
                      <><Circle className="w-3.5 h-3.5 mr-1.5" /> Deactivate</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Set Active</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteBudgetId(selectedBudget.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Budget</div>
                  <div className="font-semibold text-sm">{fmt(totalBudgeted)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground mb-1">Spent to Date</div>
                  <div className="font-semibold text-sm">{fmt(totalActual)}</div>
                </div>
                <div className={cn("rounded-lg p-3", totalRemaining < 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-green-50 dark:bg-green-950/30")}>
                  <div className="text-xs text-muted-foreground mb-1">Remaining</div>
                  <div className={cn("font-semibold text-sm", totalRemaining < 0 ? "text-red-600" : "text-green-600")}>
                    {fmt(totalRemaining)}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground mb-1">% Used</div>
                  <div className="font-semibold text-sm">{overallPercent}%</div>
                  <Progress value={Math.min(overallPercent, 100)} className="h-1 mt-1.5" />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold text-sm">Budget Lines</h3>
                <div className="flex items-center gap-2">
                  {lines.length > 0 && budgetMonths.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setShowMonthlyGrid((v) => !v)}>
                      {showMonthlyGrid ? "Hide monthly grid" : "Show monthly grid"}
                    </Button>
                  )}
                  <Button size="sm" onClick={openAddLine}>
                    <Plus className="w-4 h-4 mr-1" /> Add Line
                  </Button>
                </div>
              </div>

              {loadingLines && (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
              )}

              {!loadingLines && lines.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground text-sm mb-3">No line items yet</p>
                  <Button size="sm" variant="outline" onClick={openAddLine}>
                    <Plus className="w-4 h-4 mr-1" /> Add First Line
                  </Button>
                </div>
              )}

              {!loadingLines && lines.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Account</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Annual Budget</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Actual</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Remaining</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs min-w-[120px]">Used</th>
                        <th className="px-2 py-2.5 w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map(line => (
                        <tr key={line.id} className={cn("hover:bg-muted/20 transition-colors", line.overBudget && "bg-red-50/50 dark:bg-red-950/10")}>
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {line.account ? `${line.account.code} – ${line.account.name}` : line.accountId}
                            </div>
                            {line.account && (
                              <div className="text-xs text-muted-foreground">{line.account.type}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => startEdit(line)}
                              className="group flex items-center gap-1 ml-auto hover:text-primary transition-colors"
                            >
                              <span className="font-medium">{fmt(line.amount)}</span>
                              <Edit2 className="w-3 h-3 opacity-60 shrink-0" />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{fmt(line.actual)}</td>
                          <td className={cn("px-4 py-3 text-right font-medium", line.remaining < 0 ? "text-red-600" : "text-green-600")}>
                            {line.remaining < 0 ? (
                              <span className="flex items-center justify-end gap-1">
                                <TrendingUp className="w-3 h-3" /> {fmt(Math.abs(line.remaining))} over
                              </span>
                            ) : (
                              <span>{fmt(line.remaining)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.min(line.percent, 100)}
                                className={cn("h-1.5 flex-1", line.overBudget && "[&>div]:bg-red-500")}
                              />
                              <span className={cn("text-xs w-9 text-right", line.overBudget ? "text-red-600 font-medium" : "text-muted-foreground")}>
                                {line.percent}%
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <button
                              onClick={() => setDeleteLineId(line.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">Total</td>
                        <td className="px-4 py-3 text-right">{fmt(totalBudgeted)}</td>
                        <td className="px-4 py-3 text-right">{fmt(totalActual)}</td>
                        <td className={cn("px-4 py-3 text-right", totalRemaining < 0 ? "text-red-600" : "text-green-600")}>
                          {fmt(totalRemaining)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(overallPercent, 100)} className="h-1.5 flex-1" />
                            <span className="text-xs w-9 text-right text-muted-foreground">{overallPercent}%</span>
                          </div>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {showMonthlyGrid && lines.length > 0 && budgetMonths.length > 0 && (
                <div className="border-t overflow-x-auto">
                  <table className="w-full text-xs min-w-[720px]">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/20">Account</th>
                        {budgetMonths.map((m) => (
                          <th key={m.key} className="text-right px-2 py-2 font-medium text-muted-foreground whitespace-nowrap">{m.label}</th>
                        ))}
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Annual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((line) => (
                        <tr key={`monthly-${line.id}`} className="hover:bg-muted/10">
                          <td className="px-4 py-2 font-medium sticky left-0 bg-card whitespace-nowrap">
                            {line.account ? `${line.account.code}` : line.accountId}
                          </td>
                          {budgetMonths.map((m, i) => (
                            <td key={`${line.id}-${m.key}`} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                              {fmt(line.monthlyAmounts[i] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-semibold">{fmt(line.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/20 font-semibold">
                        <td className="px-4 py-2 sticky left-0 bg-muted/20">Monthly totals</td>
                        {budgetMonths.map((m, i) => (
                          <td key={`total-${m.key}`} className="px-2 py-2 text-right">
                            {fmt(lines.reduce((s, l) => s + (l.monthlyAmounts[i] ?? 0), 0))}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right">{fmt(totalBudgeted)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Create Budget Dialog ─────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Budget</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Budget Name</label>
              <Input name="name" required placeholder="e.g. Annual Operating Budget 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fiscal Year</label>
                <Input name="fiscalYear" type="number" required defaultValue={currentYear} min={2000} max={2099} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Set as Active</label>
                <div className="flex items-center h-10">
                  <input type="checkbox" name="isActive" id="isActive" className="h-4 w-4 rounded border-input" />
                  <label htmlFor="isActive" className="ml-2 text-sm">Make active budget</label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start Date</label>
                <Input name="startDate" type="date" required defaultValue={`${currentYear}-01-01`} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">End Date</label>
                <Input name="endDate" type="date" required defaultValue={`${currentYear}-12-31`} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createBudget.isPending}>
                {createBudget.isPending ? "Creating…" : "Create Budget"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Line Item Dialog ─────────────────────────────────────── */}
      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Budget Line</DialogTitle></DialogHeader>
          <form onSubmit={handleAddLineSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Account</label>
              <select
                name="accountId"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select an account…</option>
                {Object.entries(groupedCoa).sort().map(([type, accts]) => (
                  <optgroup key={type} label={type}>
                    {accts.sort((a, b) => a.code.localeCompare(b.code)).map(a => (
                      <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {coaOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">All active accounts are already in this budget.</p>
              )}
            </div>
            <MonthlyAmountGrid
              months={budgetMonths.length > 0 ? budgetMonths : Array.from({ length: 12 }, (_, i) => ({
                key: `m${i}`,
                label: `Month ${i + 1}`,
              }))}
              values={addMonthly}
              onChange={setAddMonthly}
              disabled={addLine.isPending}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddLineOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addLine.isPending || coaOptions.length === 0}>
                {addLine.isPending ? "Adding…" : "Add Line"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Monthly Amounts Dialog ──────────────────────────────── */}
      <Dialog open={!!editLine} onOpenChange={(open) => !open && setEditLine(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Monthly budget — {editLine?.account ? `${editLine.account.code} – ${editLine.account.name}` : "Account"}
            </DialogTitle>
          </DialogHeader>
          {editLine && (
            <div className="space-y-4 pt-2">
              <MonthlyAmountGrid
                months={budgetMonths}
                values={editMonthly}
                onChange={setEditMonthly}
                disabled={updateLine.isPending}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditLine(null)}>Cancel</Button>
                <Button onClick={saveEdit} disabled={updateLine.isPending}>
                  {updateLine.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Budget Confirmation ───────────────────────────────── */}
      <AlertDialog open={!!deleteBudgetId} onOpenChange={open => !open && setDeleteBudgetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the budget and all {lines.length} line item{lines.length !== 1 ? "s" : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteBudgetId && deleteBudget.mutate(deleteBudgetId)}
              disabled={deleteBudget.isPending}
            >
              Delete Budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Line Confirmation ─────────────────────────────────── */}
      <AlertDialog open={!!deleteLineId} onOpenChange={open => !open && setDeleteLineId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Line Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the budget line from this budget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteLineId && deleteLine.mutate(deleteLineId)}
              disabled={deleteLine.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
