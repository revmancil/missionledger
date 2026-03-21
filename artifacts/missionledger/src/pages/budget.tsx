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
  TrendingUp, TrendingDown, ChevronRight, Edit2, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function apiGet(path: string) {
  return fetch(`${BASE}${path}`, { credentials: "include" }).then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)));
}
function apiPost(path: string, body: any) {
  return fetch(`${BASE}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)));
}
function apiPut(path: string, body: any) {
  return fetch(`${BASE}${path}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)));
}
function apiDelete(path: string) {
  return fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" })
    .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error)));
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

interface BudgetLine {
  id: string;
  accountId: string;
  amount: number;
  actual: number;
  remaining: number;
  percent: number;
  overBudget: boolean;
  account: { id: string; code: string; name: string; type: string } | null;
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
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);

  const { data: budgetList = [], isLoading: loadingList } = useQuery<BudgetSummary[]>({
    queryKey: ["budgets"],
    queryFn: () => apiGet("api/budgets"),
  });

  const selectedBudget = budgetList.find(b => b.id === selectedId) ?? null;

  const { data: lines = [], isLoading: loadingLines } = useQuery<BudgetLine[]>({
    queryKey: ["budget-lines", selectedId],
    queryFn: () => apiGet(`api/budgets/${selectedId}/lines`),
    enabled: !!selectedId,
  });

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
    onError: (e: any) => toast.error(e ?? "Failed to create budget"),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPut(`api/budgets/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
    onError: (e: any) => toast.error(e ?? "Failed to update"),
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => apiDelete(`api/budgets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      if (deleteBudgetId === selectedId) setSelectedId(null);
      setDeleteBudgetId(null);
      toast.success("Budget deleted");
    },
    onError: (e: any) => toast.error(e ?? "Failed to delete"),
  });

  const addLine = useMutation({
    mutationFn: (body: any) => apiPost(`api/budgets/${selectedId}/lines`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setAddLineOpen(false);
      toast.success("Line item added");
    },
    onError: (e: any) => toast.error(e ?? "Failed to add line"),
  });

  const updateLine = useMutation({
    mutationFn: ({ lineId, amount }: { lineId: string; amount: number }) =>
      apiPut(`api/budgets/${selectedId}/lines/${lineId}`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setEditingLineId(null);
    },
    onError: (e: any) => toast.error(e ?? "Failed to update"),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => apiDelete(`api/budgets/${selectedId}/lines/${lineId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-lines", selectedId] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
      setDeleteLineId(null);
      toast.success("Line item removed");
    },
    onError: (e: any) => toast.error(e ?? "Failed to delete"),
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

  function handleAddLineSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addLine.mutate({
      accountId: fd.get("accountId"),
      amount: parseFloat(fd.get("amount") as string),
    });
  }

  function startEdit(line: BudgetLine) {
    setEditingLineId(line.id);
    setEditAmount(String(line.amount));
  }

  function saveEdit(lineId: string) {
    const val = parseFloat(editAmount);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid amount"); return; }
    updateLine.mutate({ lineId, amount: val });
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
                <Button size="sm" onClick={() => setAddLineOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Line
                </Button>
              </div>

              {loadingLines && (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
              )}

              {!loadingLines && lines.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground text-sm mb-3">No line items yet</p>
                  <Button size="sm" variant="outline" onClick={() => setAddLineOpen(true)}>
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
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Budgeted</th>
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
                            {editingLineId === line.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  value={editAmount}
                                  onChange={e => setEditAmount(e.target.value)}
                                  className="w-28 h-7 text-right text-sm"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") saveEdit(line.id);
                                    if (e.key === "Escape") setEditingLineId(null);
                                  }}
                                />
                                <button
                                  onClick={() => saveEdit(line.id)}
                                  className="text-green-600 hover:text-green-700 p-0.5"
                                  disabled={updateLine.isPending}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingLineId(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(line)}
                                className="group flex items-center gap-1 ml-auto hover:text-primary transition-colors"
                              >
                                <span className="font-medium">{fmt(line.amount)}</span>
                                <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" />
                              </button>
                            )}
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
        <DialogContent className="max-w-md">
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
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Budgeted Amount</label>
              <Input name="amount" type="number" required min="0" step="0.01" placeholder="0.00" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddLineOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addLine.isPending || coaOptions.length === 0}>
                {addLine.isPending ? "Adding…" : "Add Line"}
              </Button>
            </div>
          </form>
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
