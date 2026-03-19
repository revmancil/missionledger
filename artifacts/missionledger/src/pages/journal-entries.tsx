import { useState, useCallback, useId } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetAccounts, useGetFunds } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  RotateCcw,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

interface Row {
  id: string;
  accountId: string;
  fundId: string;
  debit: string;
  credit: string;
  memo: string;
}

function makeRow(): Row {
  return {
    id: crypto.randomUUID(),
    accountId: "",
    fundId: "",
    debit: "",
    credit: "",
    memo: "",
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Restricted (Temp)",
  RESTRICTED_PERM: "Restricted (Perm)",
  BOARD_DESIGNATED: "Board Designated",
};

export default function JournalEntriesPage() {
  const { data: allAccounts = [] } = useGetAccounts();
  const { data: allFunds = [] } = useGetFunds();

  const [entryDate, setEntryDate] = useState(today());
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([makeRow(), makeRow()]);
  const [posting, setPosting] = useState(false);
  const [postedEntry, setPostedEntry] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const totalDebits = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const totalCredits = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  const isBalanced = diff < 0.01 && totalDebits > 0;
  const rowsValid = rows.every(r => r.accountId && r.fundId);
  const canPost =
    isBalanced &&
    rowsValid &&
    description.trim() !== "" &&
    entryDate !== "" &&
    rows.length >= 2;

  const updateRow = useCallback(
    (id: string, patch: Partial<Omit<Row, "id">>) => {
      setRows(prev =>
        prev.map(r => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    []
  );

  const addRow = () => setRows(prev => [...prev, makeRow()]);

  const removeRow = (id: string) => {
    setRows(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter(r => r.id !== id);
    });
  };

  const handleDebitChange = (id: string, val: string) => {
    updateRow(id, { debit: val, credit: val ? "" : "" });
    if (val) updateRow(id, { debit: val, credit: "" });
  };

  const handleCreditChange = (id: string, val: string) => {
    if (val) updateRow(id, { credit: val, debit: "" });
    else updateRow(id, { credit: val });
  };

  const resetForm = () => {
    setEntryDate(today());
    setReferenceNumber("");
    setDescription("");
    setRows([makeRow(), makeRow()]);
    setPostedEntry(null);
  };

  const handlePost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      const createRes = await api(`${BASE}api/journal-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: entryDate,
          description,
          memo: referenceNumber || null,
          referenceNumber: referenceNumber || null,
          lines: rows.map(r => ({
            accountId: r.accountId,
            fundId: r.fundId || null,
            debit: parseFloat(r.debit) || 0,
            credit: parseFloat(r.credit) || 0,
            description: r.memo || null,
          })),
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create journal entry");
      }

      const draft = await createRes.json();

      const postRes = await api(`${BASE}api/journal-entries/${draft.id}/post`, {
        method: "POST",
      });

      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to post journal entry");
      }

      const posted = await postRes.json();
      setPostedEntry(posted);
      toast.success(`Journal entry ${posted.entryNumber} posted successfully`);
    } catch (err: any) {
      toast.error(err.message || "An error occurred while posting");
    } finally {
      setPosting(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api(`${BASE}api/journal-entries`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.filter((e: any) => e.status === "POSTED"));
      }
    } catch {
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleHistory = () => {
    if (!showHistory && history.length === 0) loadHistory();
    setShowHistory(v => !v);
  };

  const sortedAccounts = [...allAccounts].sort((a: any, b: any) =>
    (a.code || "").localeCompare(b.code || "")
  );
  const sortedFunds = [...allFunds].sort((a: any, b: any) =>
    (a.name || "").localeCompare(b.name || "")
  );

  if (postedEntry) {
    return (
      <AppLayout title="Manual Journal Entry">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Journal Entry Posted
              </h2>
              <p className="text-muted-foreground mt-1">
                {postedEntry.entryNumber} has been posted to the General Ledger
              </p>
            </div>

            <div className="w-full bg-white dark:bg-card rounded-lg border border-border p-4 text-left space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry Number</span>
                <span className="font-mono font-semibold">{postedEntry.entryNumber}</span>
              </div>
              {postedEntry.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference #</span>
                  <span className="font-medium">{postedEntry.referenceNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry Date</span>
                <span className="font-medium">{formatDate(postedEntry.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium max-w-[55%] text-right">{postedEntry.description}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total Debits / Credits</span>
                <span className="text-green-700 dark:text-green-400">
                  {formatCurrency(
                    postedEntry.lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) ?? 0
                  )}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Source type: <code className="bg-muted px-1 rounded">MANUAL_JE</code> — {postedEntry.lines?.length ?? 0} GL entries written
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={resetForm} className="gap-2">
                <Plus className="w-4 h-4" />
                New Entry
              </Button>
              <Button variant="outline" onClick={handleToggleHistory} className="gap-2">
                <History className="w-4 h-4" />
                View History
              </Button>
            </div>
          </div>

          {showHistory && (
            <HistoryPanel
              history={history}
              loading={loadingHistory}
              onRefresh={loadHistory}
            />
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Manual Journal Entry">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">New Journal Entry</h2>
              <p className="text-xs text-muted-foreground">
                Create a manual debit/credit entry in the General Ledger
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleToggleHistory} className="gap-2 text-muted-foreground">
            <History className="w-4 h-4" />
            History
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </Button>
        </div>

        {showHistory && (
          <HistoryPanel
            history={history}
            loading={loadingHistory}
            onRefresh={loadHistory}
          />
        )}

        {/* Header Fields */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Entry Header</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="entry-date" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Entry Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="entry-date"
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference-number" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reference #
              </Label>
              <Input
                id="reference-number"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g. MJE-001, INV-2024-05"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5 md:col-span-1">
              <Label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                General Description <span className="text-destructive">*</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Reason for this journal entry"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Entry Grid */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Entry Lines</h3>
            <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide min-w-[220px]">
                    Account <span className="text-destructive">*</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide min-w-[180px]">
                    Fund <span className="text-destructive">*</span>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide w-[130px] text-right">
                    Debit
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide w-[130px] text-right">
                    Credit
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide min-w-[160px]">
                    Memo
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow key={row.id} className="align-top">
                    <TableCell className="py-2">
                      <Select
                        value={row.accountId || "__none__"}
                        onValueChange={v => updateRow(row.id, { accountId: v === "__none__" ? "" : v })}
                      >
                        <SelectTrigger className={cn("text-sm h-9", !row.accountId && "border-amber-400")}>
                          <SelectValue placeholder="Select account…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="__none__" disabled>Select account…</SelectItem>
                          {sortedAccounts.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-2">
                      <Select
                        value={row.fundId || "__none__"}
                        onValueChange={v => updateRow(row.id, { fundId: v === "__none__" ? "" : v })}
                      >
                        <SelectTrigger className={cn("text-sm h-9", !row.fundId && "border-amber-400")}>
                          <SelectValue placeholder="Select fund…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="__none__" disabled>Select fund…</SelectItem>
                          {sortedFunds.map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                              {f.fundType ? ` — ${FUND_TYPE_LABELS[f.fundType] ?? f.fundType}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.debit}
                        onChange={e => handleDebitChange(row.id, e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          "text-right text-sm h-9 tabular-nums",
                          row.debit && "font-semibold text-blue-700 dark:text-blue-400"
                        )}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.credit}
                        onChange={e => handleCreditChange(row.id, e.target.value)}
                        placeholder="0.00"
                        className={cn(
                          "text-right text-sm h-9 tabular-nums",
                          row.credit && "font-semibold text-emerald-700 dark:text-emerald-400"
                        )}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        value={row.memo}
                        onChange={e => updateRow(row.id, { memo: e.target.value })}
                        placeholder="Line description…"
                        className="text-sm h-9"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 2}
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="px-4 py-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              className="gap-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </Button>
          </div>
        </div>

        {/* Balance Footer */}
        <div className={cn(
          "rounded-xl border p-5 transition-colors",
          isBalanced
            ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
            : totalDebits > 0 || totalCredits > 0
              ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
              : "border-border bg-muted/20"
        )}>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Total Debits
                </div>
                <div className="text-lg font-bold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatCurrency(totalDebits)}
                </div>
              </div>
              <div className="text-muted-foreground font-light text-xl">=</div>
              <div className="text-center">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Total Credits
                </div>
                <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(totalCredits)}
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-2">
              {isBalanced ? (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-semibold">Balanced — ready to post</span>
                </div>
              ) : totalDebits > 0 || totalCredits > 0 ? (
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Out of balance by {formatCurrency(diff)}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Enter debit and credit amounts to check balance
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={resetForm}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handlePost}
                disabled={!canPost || posting}
                className="gap-2 min-w-[100px]"
              >
                {posting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                    Posting…
                  </span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Post Entry
                  </>
                )}
              </Button>
            </div>
          </div>

          {!canPost && (isBalanced || totalDebits === 0) && (
            <ul className="mt-3 space-y-0.5">
              {description.trim() === "" && (
                <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  General description is required
                </li>
              )}
              {!entryDate && (
                <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  Entry date is required
                </li>
              )}
              {!rowsValid && (
                <li className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  All rows must have an account and fund selected (highlighted in amber)
                </li>
              )}
              {totalDebits === 0 && (
                <li className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  Enter at least one debit and one credit amount
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function HistoryPanel({
  history,
  loading,
  onRefresh,
}: {
  history: any[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Posted Entries</h3>
          <Badge variant="secondary" className="text-xs">{history.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="text-xs gap-1.5">
          <RotateCcw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {loading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
      ) : history.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          No posted journal entries yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Entry #</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Reference</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Description</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Total Debits</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry: any) => {
                const totalDebit = (entry.lines ?? []).reduce(
                  (s: number, l: any) => s + (l.debit || 0),
                  0
                );
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-sm font-semibold">{entry.entryNumber}</TableCell>
                    <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.referenceNumber || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[220px] truncate">{entry.description}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-medium">
                      {formatCurrency(totalDebit)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entry.lines?.length ?? 0} lines
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
