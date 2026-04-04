import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, Circle, Lock, Unlock, RefreshCw, ChevronLeft,
  AlertTriangle, CheckCheck, Banknote, FileCheck, Clock,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
function api(url: string, init?: RequestInit) {
  const token = localStorage.getItem("ml_token");
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BankAccount { id: string; name: string; accountNumber: string; currentBalance: number; }
interface ReconItem {
  id: string;
  transactionId: string | null;
  cleared: boolean;
  transaction: {
    id: string; date: string; payee: string; amount: number;
    type: "DEBIT" | "CREDIT"; status: string;
    checkNumber: string | null; memo: string | null;
  } | null;
}
interface Reconciliation {
  id: string; bankAccountId: string; statementDate: string;
  statementBalance: number; openingBalance: number;
  clearedBalance: number | null; difference: number | null;
  status: "IN_PROGRESS" | "COMPLETED" | "VOID";
  reconciledBy: string | null; reconciledAt: string | null;
}
interface HistoryRecord extends Reconciliation {
  bankAccountName?: string;
}

type Phase = "history" | "setup" | "workspace" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function DiffBadge({ diff }: { diff: number }) {
  const zero = Math.abs(diff) < 0.005;
  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-lg",
      zero
        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
        : "bg-red-50 border-red-300 text-red-700"
    )}>
      {zero
        ? <CheckCheck className="h-5 w-5" />
        : <AlertTriangle className="h-5 w-5" />}
      <span>Difference: {fmt(diff)}</span>
      {zero && <span className="text-sm font-normal ml-1">— Ready to reconcile!</span>}
    </div>
  );
}

// ── History Screen ────────────────────────────────────────────────────────────
function HistoryScreen({
  history, bankAccounts, onStart, loading,
}: {
  history: HistoryRecord[];
  bankAccounts: BankAccount[];
  onStart: () => void;
  loading: boolean;
}) {
  const bankMap = Object.fromEntries(bankAccounts.map((b) => [b.id, b]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Bank Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Match your ledger to your bank statement</p>
        </div>
        <Button onClick={onStart} className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white gap-2">
          <FileCheck className="h-4 w-4" /> Start Reconciliation
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground animate-pulse">Loading history…</div>
      ) : history.length === 0 ? (
        <div className="py-20 text-center">
          <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">No reconciliations yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Click "Start Reconciliation" to match your ledger to a bank statement.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(210,40%,97%)] border-b">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Bank Account</th>
                <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Statement Date</th>
                <th className="text-right px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Statement Balance</th>
                <th className="text-right px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Cleared Balance</th>
                <th className="text-center px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Completed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map((r) => {
                const bank = bankMap[r.bankAccountId];
                return (
                  <tr key={r.id} className="hover:bg-[hsl(210,60%,98%)] transition-colors">
                    <td className="px-5 py-3 font-medium">{bank?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {format(parseISO(r.statementDate), "MMM d, yyyy")}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{fmt(r.statementBalance)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {r.clearedBalance !== null ? fmt(r.clearedBalance) : "—"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {r.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                          <Lock className="h-3 w-3" /> Reconciled
                        </span>
                      ) : r.status === "IN_PROGRESS" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                          <Clock className="h-3 w-3" /> In Progress
                        </span>
                      ) : (
                        <span className="inline-flex text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {r.reconciledBy ?? "—"}
                      {r.reconciledAt && (
                        <div className="text-xs">{format(parseISO(r.reconciledAt), "MM/dd/yyyy")}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Setup Screen ──────────────────────────────────────────────────────────────
function SetupScreen({
  bankAccounts, onSubmit, onBack, saving,
}: {
  bankAccounts: BankAccount[];
  onSubmit: (v: { bankAccountId: string; statementDate: string; statementBalance: string }) => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [statementDate, setStatementDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statementBalance, setStatementBalance] = useState("");
  const [err, setErr] = useState("");

  const selected = bankAccounts.find((b) => b.id === bankAccountId);

  function submit() {
    if (!bankAccountId) { setErr("Please select a bank account"); return; }
    if (!statementDate) { setErr("Please enter the statement ending date"); return; }
    if (!statementBalance || isNaN(parseFloat(statementBalance))) {
      setErr("Please enter the statement ending balance"); return;
    }
    setErr("");
    onSubmit({ bankAccountId, statementDate, statementBalance });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Begin Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Enter the details from your bank statement</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-6">
          {err && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          <div>
            <Label className="text-sm font-semibold">Bank Account</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="mt-1.5 h-11">
                <SelectValue placeholder="Select bank account…" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                      {b.name}
                      {b.accountNumber && <span className="text-muted-foreground text-xs">…{b.accountNumber.slice(-4)}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Ledger balance: <span className="font-semibold">{fmt(selected.currentBalance)}</span>
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-semibold">Statement Ending Date</Label>
            <Input
              type="date" value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="mt-1.5 h-11"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              All transactions on or before this date will be included.
            </p>
          </div>

          <div>
            <Label className="text-sm font-semibold">Statement Ending Balance</Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                className="pl-7 h-11 text-lg font-semibold"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Find this on the last page of your bank statement.
            </p>
          </div>

          <Button
            onClick={submit} disabled={saving}
            className="w-full h-12 text-base bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white gap-2"
          >
            {saving ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <><FileCheck className="h-4 w-4" /> Open Reconciliation Workspace</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Transaction Row ───────────────────────────────────────────────────────────
function TxRow({ item, onToggle, locked }: {
  item: ReconItem; onToggle: () => void; locked: boolean;
}) {
  const tx = item.transaction;
  if (!tx) return null;
  const isCredit = tx.type === "CREDIT";
  return (
    <tr
      onClick={locked ? undefined : onToggle}
      className={cn(
        "border-b border-gray-50 transition-colors",
        locked ? "cursor-default" : "cursor-pointer hover:bg-[hsl(210,60%,98%)]",
        item.cleared && "bg-emerald-50/40"
      )}
    >
      <td className="pl-4 pr-2 py-3">
        <div
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            item.cleared
              ? "bg-emerald-500 border-emerald-500"
              : "border-gray-300 bg-white"
          )}
        >
          {item.cleared && <CheckCheck className="h-3 w-3 text-white" />}
        </div>
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {format(parseISO(tx.date), "MM/dd/yyyy")}
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground">
        {tx.checkNumber ?? "—"}
      </td>
      <td className="px-2 py-3">
        <div className="text-sm font-medium text-foreground">{tx.payee}</div>
        {tx.memo && <div className="text-xs text-muted-foreground italic">{tx.memo}</div>}
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-sm font-semibold">
        {isCredit
          ? <span className="text-emerald-600">{fmt(tx.amount)}</span>
          : <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold">
        {!isCredit
          ? <span className="text-red-600">{fmt(tx.amount)}</span>
          : <span className="text-muted-foreground/40">—</span>}
      </td>
    </tr>
  );
}

// ── Workspace Screen ──────────────────────────────────────────────────────────
function WorkspaceScreen({
  recon, items, bankAccounts, onToggle, onToggleAll,
  onComplete, onBack, completing,
}: {
  recon: Reconciliation;
  items: ReconItem[];
  bankAccounts: BankAccount[];
  onToggle: (item: ReconItem) => void;
  onToggleAll: (col: "credits" | "debits", cleared: boolean) => void;
  onComplete: () => void;
  onBack: () => void;
  completing: boolean;
}) {
  const bank = bankAccounts.find((b) => b.id === recon.bankAccountId);
  const locked = recon.status === "COMPLETED";

  const credits = items.filter((i) => i.transaction?.type === "CREDIT");
  const debits  = items.filter((i) => i.transaction?.type === "DEBIT");

  // Live math
  const clearedCredits = credits.filter((i) => i.cleared).reduce((s, i) => s + (i.transaction?.amount ?? 0), 0);
  const clearedDebits  = debits.filter((i) => i.cleared).reduce((s, i) => s + (i.transaction?.amount ?? 0), 0);
  const clearedBalance = (recon.openingBalance ?? 0) + clearedCredits - clearedDebits;
  const difference     = recon.statementBalance - clearedBalance;
  const balanced       = Math.abs(difference) < 0.005;

  const allCreditsChecked = credits.length > 0 && credits.every((i) => i.cleared);
  const allDebitsChecked  = debits.length > 0 && debits.every((i) => i.cleared);

  return (
    <div className="space-y-4 -m-4 md:-m-8">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          {!locked && (
            <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[hsl(210,60%,25%)]">
                {locked ? "Reconciled — " : "Reconciling — "}
                {bank?.name ?? "Bank Account"}
              </h2>
              {locked && <Lock className="h-5 w-5 text-emerald-600" />}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Statement through {format(parseISO(recon.statementDate), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column workspace ─────────────────── */}
      <div className="px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── CREDITS column ───────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <div>
                <h3 className="font-semibold text-emerald-800">Deposits / Credits</h3>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {credits.filter((i) => i.cleared).length} of {credits.length} checked
                  {" · "}
                  <span className="font-semibold">{fmt(clearedCredits)}</span> cleared
                </p>
              </div>
              {!locked && credits.length > 0 && (
                <button
                  onClick={() => onToggleAll("credits", !allCreditsChecked)}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-medium px-2 py-1 rounded border border-emerald-200 hover:bg-emerald-100"
                >
                  {allCreditsChecked ? "Uncheck All" : "Check All"}
                </button>
              )}
            </div>
            <table className="w-full">
              <thead className="bg-[hsl(150,20%,98%)] border-b">
                <tr>
                  <th className="pl-4 pr-2 py-2 w-8"></th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Date</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Ref</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Payee</th>
                  <th className="px-4 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase" colSpan={2}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {credits.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground italic">No deposits in this period</td></tr>
                ) : (
                  credits.map((item) => (
                    <TxRow key={item.id} item={item} onToggle={() => !locked && onToggle(item)} locked={locked} />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── DEBITS column ────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
              <div>
                <h3 className="font-semibold text-[hsl(210,60%,30%)]">Checks / Payments</h3>
                <p className="text-xs text-[hsl(210,60%,50%)] mt-0.5">
                  {debits.filter((i) => i.cleared).length} of {debits.length} checked
                  {" · "}
                  <span className="font-semibold">{fmt(clearedDebits)}</span> cleared
                </p>
              </div>
              {!locked && debits.length > 0 && (
                <button
                  onClick={() => onToggleAll("debits", !allDebitsChecked)}
                  className="text-xs text-[hsl(210,60%,40%)] hover:text-[hsl(210,60%,25%)] font-medium px-2 py-1 rounded border border-blue-200 hover:bg-blue-100"
                >
                  {allDebitsChecked ? "Uncheck All" : "Check All"}
                </button>
              )}
            </div>
            <table className="w-full">
              <thead className="bg-[hsl(210,20%,98%)] border-b">
                <tr>
                  <th className="pl-4 pr-2 py-2 w-8"></th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Date</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Check #</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase">Payee</th>
                  <th className="px-4 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase" colSpan={2}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {debits.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground italic">No payments in this period</td></tr>
                ) : (
                  debits.map((item) => (
                    <TxRow key={item.id} item={item} onToggle={() => !locked && onToggle(item)} locked={locked} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ───────────────────────────── */}
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <div className="flex flex-wrap gap-6 items-center justify-between">
            {/* Totals */}
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Opening Balance</div>
                <div className="text-base font-semibold tabular-nums">{fmt(recon.openingBalance)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">+ Cleared Deposits</div>
                <div className="text-base font-semibold text-emerald-600 tabular-nums">+{fmt(clearedCredits)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">− Cleared Payments</div>
                <div className="text-base font-semibold text-red-500 tabular-nums">−{fmt(clearedDebits)}</div>
              </div>
              <div className="border-l border-gray-200 pl-8">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Cleared Balance</div>
                <div className="text-xl font-bold tabular-nums">{fmt(clearedBalance)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Statement Balance</div>
                <div className="text-xl font-bold text-[hsl(210,60%,25%)] tabular-nums">{fmt(recon.statementBalance)}</div>
              </div>
            </div>

            {/* Difference + button */}
            <div className="flex flex-col items-end gap-3">
              <DiffBadge diff={difference} />
              {!locked && (
                <Button
                  onClick={onComplete}
                  disabled={!balanced || completing}
                  className={cn(
                    "gap-2 px-6 h-11 text-base font-semibold transition-all",
                    balanced
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {completing
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Reconciling…</>
                    : <><Lock className="h-4 w-4" /> Reconcile Now</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Done Screen ───────────────────────────────────────────────────────────────
function DoneScreen({ recon, bankAccounts, onReset }: {
  recon: Reconciliation; bankAccounts: BankAccount[]; onReset: () => void;
}) {
  const bank = bankAccounts.find((b) => b.id === recon.bankAccountId);
  return (
    <div className="max-w-md mx-auto py-12 text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center mx-auto">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Reconciliation Complete!</h2>
        <p className="text-muted-foreground mt-1">
          {bank?.name} — Statement through {format(parseISO(recon.statementDate), "MMMM d, yyyy")}
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6 text-left space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Statement Balance</span>
          <span className="font-semibold">{fmt(recon.statementBalance)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cleared Balance</span>
          <span className="font-semibold">{fmt(recon.clearedBalance ?? 0)}</span>
        </div>
        <div className="border-t pt-3 flex justify-between text-sm">
          <span className="text-muted-foreground">Difference</span>
          <span className="font-bold text-emerald-600">{fmt(recon.difference ?? 0)}</span>
        </div>
        {recon.reconciledBy && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Reconciled by</span>
            <span className="font-medium">{recon.reconciledBy}</span>
          </div>
        )}
        {recon.reconciledAt && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Completed at</span>
            <span className="font-medium">{format(parseISO(recon.reconciledAt), "MMM d, yyyy h:mm a")}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <Lock className="h-4 w-4 shrink-0" />
        All cleared transactions have been locked as <strong>Reconciled (R)</strong>
      </div>
      <Button onClick={onReset} variant="outline" className="gap-2">
        <ChevronLeft className="h-4 w-4" /> Back to History
      </Button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReconciliationPage() {
  const [phase, setPhase] = useState<Phase>("history");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [items, setItems] = useState<ReconItem[]>([]);
  const [activeRecon, setActiveRecon] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const [banksR, histR] = await Promise.all([
        api(`${BASE}api/bank-accounts`),
        api(`${BASE}api/reconciliation`),
      ]);
      if (banksR.ok) setBankAccounts(await banksR.json());
      if (histR.ok) setHistory(await histR.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleSetupSubmit(vals: { bankAccountId: string; statementDate: string; statementBalance: string }) {
    setSaving(true);
    try {
      const res = await api(`${BASE}api/reconciliation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      if (!res.ok) return;
      const created: Reconciliation = await res.json();
      await loadWorkspace(created.id, created);
    } finally { setSaving(false); }
  }

  async function loadWorkspace(id: string, recon: Reconciliation) {
    const res = await api(`${BASE}api/reconciliation/${id}/items`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveRecon(data.reconciliation ?? recon);
    setItems(data.items ?? []);
    setPhase("workspace");
  }

  async function handleToggle(item: ReconItem) {
    if (!activeRecon) return;
    const next = !item.cleared;
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, cleared: next } : i));
    await api(`${BASE}api/reconciliation/${activeRecon.id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleared: next }),
    });
  }

  function handleToggleAll(col: "credits" | "debits", cleared: boolean) {
    if (!activeRecon) return;
    const type = col === "credits" ? "CREDIT" : "DEBIT";
    const targets = items.filter((i) => i.transaction?.type === type);
    setItems((prev) =>
      prev.map((i) => (i.transaction?.type === type ? { ...i, cleared } : i))
    );
    Promise.all(
      targets.map((item) =>
        api(`${BASE}api/reconciliation/${activeRecon.id}/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleared }),
        })
      )
    );
  }

  async function handleComplete() {
    if (!activeRecon) return;
    setCompleting(true);
    try {
      const res = await api(`${BASE}api/reconciliation/${activeRecon.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const e = await res.json();
        alert(e.error ?? "Could not complete reconciliation");
        return;
      }
      const finished: Reconciliation = await res.json();
      setActiveRecon(finished);
      setPhase("done");
      await loadHistory();
    } finally { setCompleting(false); }
  }

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-8rem)]">
        {phase === "history" && (
          <HistoryScreen
            history={history}
            bankAccounts={bankAccounts}
            onStart={() => setPhase("setup")}
            loading={loading}
          />
        )}
        {phase === "setup" && (
          <SetupScreen
            bankAccounts={bankAccounts}
            onSubmit={handleSetupSubmit}
            onBack={() => setPhase("history")}
            saving={saving}
          />
        )}
        {phase === "workspace" && activeRecon && (
          <WorkspaceScreen
            recon={activeRecon}
            items={items}
            bankAccounts={bankAccounts}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
            onComplete={handleComplete}
            onBack={() => setPhase("history")}
            completing={completing}
          />
        )}
        {phase === "done" && activeRecon && (
          <DoneScreen
            recon={activeRecon}
            bankAccounts={bankAccounts}
            onReset={() => { setPhase("history"); setActiveRecon(null); setItems([]); }}
          />
        )}
      </div>
    </AppLayout>
  );
}
