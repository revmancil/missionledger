import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { format, parseISO } from "date-fns";
import {
  Plus, ChevronDown, ChevronUp, CheckCircle, Circle,
  Ban, RefreshCw, Edit, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function apiFetch(url: string, init?: RequestInit) {
  return fetch(url, { credentials: "include", ...init });
}

const BASE = import.meta.env.BASE_URL;

interface BankAccount { id: string; name: string; accountNumber: string; bankName: string; currentBalance: number; }
interface ChartAccount { id: string; code: string; name: string; type: string; }
interface Fund { id: string; name: string; }
interface Transaction {
  id: string; date: string; payee: string; amount: number;
  type: "DEBIT" | "CREDIT";
  status: "UNCLEARED" | "CLEARED" | "RECONCILED" | "VOID";
  checkNumber: string | null; referenceNumber: string | null; memo: string | null;
  isVoid: boolean;
  chartAccount: ChartAccount | null; fund: Fund | null; bankAccount: BankAccount | null;
  runningBalance?: number;
}
type StatusFilter = "ALL" | "UNCLEARED" | "CLEARED" | "RECONCILED" | "VOID";

const emptyForm = {
  date: format(new Date(), "yyyy-MM-dd"),
  payee: "", amount: "",
  type: "DEBIT" as "DEBIT" | "CREDIT",
  status: "UNCLEARED" as "UNCLEARED" | "CLEARED",
  chartAccountId: "", fundId: "", bankAccountId: "",
  memo: "", checkNumber: "", referenceNumber: "",
};

function fmtAmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CLEARED:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    RECONCILED: "bg-blue-50 text-blue-700 border-blue-200",
    UNCLEARED:  "bg-amber-50 text-amber-700 border-amber-200",
    VOID:       "bg-red-50 text-red-600 border-red-200",
  };
  const label: Record<string, string> = { CLEARED: "Cleared", RECONCILED: "Reconciled", UNCLEARED: "Uncleared", VOID: "Void" };
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", map[status] ?? map.UNCLEARED)}>
      {label[status] ?? status}
    </span>
  );
}

export default function BankRegisterPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [coaList, setCoaList] = useState<ChartAccount[]>([]);
  const [fundList, setFundList] = useState<Fund[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [banksRes, coaRes, fundsRes, txRes] = await Promise.all([
        apiFetch(`${BASE}api/bank-accounts`),
        apiFetch(`${BASE}api/chart-of-accounts`),
        apiFetch(`${BASE}api/funds`),
        apiFetch(`${BASE}api/transactions`),
      ]);
      if (banksRes.ok) setBankAccounts(await banksRes.json());
      if (coaRes.ok) setCoaList(await coaRes.json());
      if (fundsRes.ok) {
        const d = await fundsRes.json();
        setFundList(Array.isArray(d) ? d : (d.data ?? []));
      }
      if (txRes.ok) setTransactions(await txRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Derived data ---
  const filtered = transactions.filter((t) => {
    if (selectedBank !== "ALL" && t.bankAccount?.id !== selectedBank) return false;
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    return true;
  });

  let rb = 0;
  const withBalance: Transaction[] = filtered.map((t) => {
    if (!t.isVoid) rb += t.type === "CREDIT" ? t.amount : -t.amount;
    return { ...t, runningBalance: rb };
  });

  const totals = filtered.reduce(
    (acc, t) => {
      if (!t.isVoid) {
        if (t.type === "DEBIT") acc.debits += t.amount;
        else acc.credits += t.amount;
      }
      return acc;
    },
    { debits: 0, credits: 0 }
  );

  const selectedBankObj = bankAccounts.find((b) => b.id === selectedBank);

  // --- Handlers ---
  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openAdd() {
    setEditTx(null);
    setForm({ ...emptyForm, bankAccountId: selectedBank !== "ALL" ? selectedBank : (bankAccounts[0]?.id ?? "") });
    setShowForm(true);
  }

  function openEdit(tx: Transaction) {
    setEditTx(tx);
    setForm({
      date: format(parseISO(tx.date), "yyyy-MM-dd"),
      payee: tx.payee, amount: String(tx.amount),
      type: tx.type,
      status: tx.status === "CLEARED" ? "CLEARED" : "UNCLEARED",
      chartAccountId: tx.chartAccount?.id ?? "",
      fundId: tx.fund?.id ?? "",
      bankAccountId: tx.bankAccount?.id ?? "",
      memo: tx.memo ?? "",
      checkNumber: tx.checkNumber ?? "",
      referenceNumber: tx.referenceNumber ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        chartAccountId: (form.chartAccountId && form.chartAccountId !== "__none__") ? form.chartAccountId : null,
        fundId: (form.fundId && form.fundId !== "__none__") ? form.fundId : null,
        bankAccountId: (form.bankAccountId && form.bankAccountId !== "__none__") ? form.bankAccountId : null,
        checkNumber: form.checkNumber || null,
        referenceNumber: form.referenceNumber || null,
        memo: form.memo || null,
      };
      const url = editTx ? `${BASE}api/transactions/${editTx.id}` : `${BASE}api/transactions`;
      const res = await apiFetch(url, {
        method: editTx ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); alert(e.error ?? "Error saving transaction"); return; }
      setShowForm(false);
      await loadAll();
    } finally { setSaving(false); }
  }

  async function handleVoid(tx: Transaction) {
    const res = await apiFetch(`${BASE}api/transactions/${tx.id}`, { method: "DELETE" });
    if (!res.ok) { alert("Failed to void transaction"); return; }
    setDeleteTarget(null);
    await loadAll();
  }

  async function toggleStatus(tx: Transaction) {
    const next = tx.status === "CLEARED" ? "UNCLEARED" : "CLEARED";
    await apiFetch(`${BASE}api/transactions/${tx.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
  }

  // --- Render ---
  return (
    <AppLayout>
    <div className="flex flex-col -m-4 md:-m-8 min-h-[calc(100vh-8rem)]">

      {/* ── Header ───────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[hsl(210,60%,25%)]">Bank Register</h1>
            <p className="text-sm text-muted-foreground mt-0.5">QuickBooks-style double-row transaction register</p>
          </div>
          <Button onClick={openAdd} className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white gap-2">
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="All Accounts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Bank Accounts</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.accountNumber ? ` (\u2026${b.accountNumber.slice(-4)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status pills */}
          <div className="flex gap-1">
            {(["ALL","UNCLEARED","CLEARED","RECONCILED","VOID"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  statusFilter === s
                    ? "bg-[hsl(210,60%,25%)] text-white border-[hsl(210,60%,25%)]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                )}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            onClick={loadAll} disabled={loading}
            className="ml-auto text-muted-foreground hover:text-foreground p-1 rounded"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Account summary bar */}
        {selectedBankObj && (
          <div className="mt-3 flex gap-6 text-sm">
            <span className="text-muted-foreground">
              Balance:&nbsp;<span className="font-semibold text-foreground">{fmtAmt(selectedBankObj.currentBalance)}</span>
            </span>
            <span className="text-muted-foreground">
              Payments:&nbsp;<span className="font-semibold text-red-600">{fmtAmt(totals.debits)}</span>
            </span>
            <span className="text-muted-foreground">
              Deposits:&nbsp;<span className="font-semibold text-emerald-600">{fmtAmt(totals.credits)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Register Table ───────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-[hsl(210,40%,96%)] border-b">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground w-28">DATE</th>
              <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-24">CHECK #</th>
              <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground">PAYEE / ACCOUNT</th>
              <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-32">PAYMENT</th>
              <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-32">DEPOSIT</th>
              <th className="text-right px-2 py-2 font-semibold text-xs text-muted-foreground w-32">BALANCE</th>
              <th className="text-center px-2 py-2 font-semibold text-xs text-muted-foreground w-28">STATUS</th>
              <th className="px-2 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {/* Empty state */}
            {withBalance.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-muted-foreground">
                  {loading
                    ? "Loading\u2026"
                    : "No transactions found. Click \u201cAdd Transaction\u201d to get started."}
                </td>
              </tr>
            )}

            {/* Double-row per transaction */}
            {withBalance.map((tx, idx) => {
              const expanded = expandedRows.has(tx.id);
              const isVoid = tx.isVoid;
              const isDebit = tx.type === "DEBIT";
              const stripe = idx % 2 === 0 ? "bg-white" : "bg-[hsl(210,40%,99%)]";

              return (
                <React.Fragment key={tx.id}>
                  {/* ROW 1 — primary data */}
                  <tr
                    className={cn(
                      "group border-b border-gray-100 cursor-pointer transition-colors",
                      stripe,
                      isVoid && "opacity-40 line-through",
                      !isVoid && "hover:bg-[hsl(210,60%,97%)]"
                    )}
                    onClick={() => toggleRow(tx.id)}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                      {format(parseISO(tx.date), "MM/dd/yyyy")}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground">
                      {tx.checkNumber ?? "\u2014"}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="font-semibold text-[hsl(210,60%,25%)]">{tx.payee}</div>
                    </td>
                    {/* Payment column */}
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {isDebit && !isVoid
                        ? <span className="text-red-600 font-medium">{fmtAmt(tx.amount)}</span>
                        : <span className="text-muted-foreground/30">\u2014</span>}
                    </td>
                    {/* Deposit column */}
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {!isDebit && !isVoid
                        ? <span className="text-emerald-600 font-medium">{fmtAmt(tx.amount)}</span>
                        : <span className="text-muted-foreground/30">\u2014</span>}
                    </td>
                    {/* Running balance */}
                    <td className="px-2 py-2.5 text-right tabular-nums text-foreground font-medium">
                      {!isVoid ? fmtAmt(tx.runningBalance ?? 0) : "\u2014"}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isVoid && (
                          <>
                            <button
                              title={tx.status === "CLEARED" ? "Mark Uncleared" : "Mark Cleared"}
                              onClick={(e) => { e.stopPropagation(); toggleStatus(tx); }}
                              className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-emerald-600"
                            >
                              {tx.status === "CLEARED"
                                ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                                : <Circle className="h-4 w-4" />}
                            </button>
                            <button
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); openEdit(tx); }}
                              className="p-1 rounded hover:bg-gray-100 text-muted-foreground hover:text-blue-600"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              title="Void"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(tx); }}
                              className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {expanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </td>
                  </tr>

                  {/* ROW 2 — account / memo detail (QuickBooks-style second row) */}
                  <tr
                    className={cn(
                      "border-b",
                      stripe,
                      isVoid && "opacity-40",
                      !expanded && "border-transparent"
                    )}
                  >
                    <td
                      colSpan={8}
                      className={cn("overflow-hidden transition-all duration-200", expanded ? "py-1" : "h-0 py-0")}
                    >
                      {expanded && (
                        <div className="px-6 pb-2 pt-0.5">
                          <div className="pl-4 border-l-2 border-[hsl(174,60%,40%)] flex flex-wrap gap-8">
                            <div>
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                                Account / Category
                              </div>
                              <div className="text-sm text-foreground">
                                {tx.chartAccount
                                  ? `${tx.chartAccount.code} \u2013 ${tx.chartAccount.name}`
                                  : <span className="text-muted-foreground italic">No account assigned</span>}
                              </div>
                            </div>
                            {tx.fund && (
                              <div>
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Fund</div>
                                <div className="text-sm text-foreground">{tx.fund.name}</div>
                              </div>
                            )}
                            {tx.bankAccount && (
                              <div>
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Bank Account</div>
                                <div className="text-sm text-foreground">{tx.bankAccount.name}</div>
                              </div>
                            )}
                            {tx.memo && (
                              <div>
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Memo</div>
                                <div className="text-sm italic text-muted-foreground">{tx.memo}</div>
                              </div>
                            )}
                            {tx.referenceNumber && (
                              <div>
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Reference</div>
                                <div className="text-sm text-foreground">{tx.referenceNumber}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer totals ───────────────────────────── */}
      {filtered.length > 0 && (
        <div className="border-t bg-[hsl(210,40%,97%)] px-6 py-2 flex items-center gap-8 text-sm">
          <span className="text-muted-foreground font-medium">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-auto text-muted-foreground">
            Total Payments:&nbsp;<span className="font-semibold text-red-600">{fmtAmt(totals.debits)}</span>
          </span>
          <span className="text-muted-foreground">
            Total Deposits:&nbsp;<span className="font-semibold text-emerald-600">{fmtAmt(totals.credits)}</span>
          </span>
          <span className="text-muted-foreground">
            Net:&nbsp;
            <span className={cn("font-semibold", totals.credits - totals.debits >= 0 ? "text-emerald-600" : "text-red-600")}>
              {fmtAmt(totals.credits - totals.debits)}
            </span>
          </span>
        </div>
      )}

      {/* ── Add / Edit Dialog ────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTx ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Date + Type */}
            <div>
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "DEBIT"|"CREDIT" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">Payment (Debit)</SelectItem>
                  <SelectItem value="CREDIT">Deposit (Credit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payee */}
            <div className="col-span-2">
              <Label className="text-xs">Payee / Vendor *</Label>
              <Input
                placeholder="Name of person or organization"
                value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
              />
            </div>

            {/* Amount + Status */}
            <div>
              <Label className="text-xs">Amount *</Label>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "UNCLEARED"|"CLEARED" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNCLEARED">Uncleared</SelectItem>
                  <SelectItem value="CLEARED">Cleared</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* COA */}
            <div className="col-span-2">
              <Label className="text-xs">Account / Category</Label>
              <Select
                value={form.chartAccountId || "__none__"}
                onValueChange={(v) => setForm({ ...form, chartAccountId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select account\u2026" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {coaList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} \u2013 {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bank + Fund */}
            <div>
              <Label className="text-xs">Bank Account</Label>
              <Select
                value={form.bankAccountId || "__none__"}
                onValueChange={(v) => setForm({ ...form, bankAccountId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select bank\u2026" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fund</Label>
              <Select
                value={form.fundId || "__none__"}
                onValueChange={(v) => setForm({ ...form, fundId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Select fund\u2026" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {fundList.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Check + Ref */}
            <div>
              <Label className="text-xs">Check Number</Label>
              <Input placeholder="e.g. 1042" value={form.checkNumber} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Reference #</Label>
              <Input placeholder="Optional" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
            </div>

            {/* Memo */}
            <div className="col-span-2">
              <Label className="text-xs">Memo / Description</Label>
              <Input placeholder="Optional memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.date || !form.payee || !form.amount}
              className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
            >
              {saving ? "Saving\u2026" : editTx ? "Save Changes" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Void Confirm ─────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{deleteTarget?.payee}</strong> ({fmtAmt(deleteTarget?.amount ?? 0)}) as{" "}
              <strong>VOID</strong>. The record is kept for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && handleVoid(deleteTarget)}
            >
              Void Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </AppLayout>
  );
}
