import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/api-base";
import { AppLayout } from "@/components/layout/AppLayout";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Restricted (Temp)",
  RESTRICTED_PERM: "Restricted (Perm)",
  BOARD_DESIGNATED: "Board Designated",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  INCOME:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  EXPENSE:   "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  EQUITY:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ASSET:     "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  LIABILITY: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function FundLedger() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<{ fund: any; entries: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem("ml_token");
    fetch(apiUrl(`/api/funds/${id}/ledger`), {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <AppLayout title="Fund Ledger">
        <div className="p-8 text-muted-foreground">Loading ledger…</div>
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout title="Fund Ledger">
        <div className="p-8 text-destructive">Error: {error}</div>
      </AppLayout>
    );
  }
  if (!data) return null;

  const { fund, entries } = data;
  const finalBalance = entries.length > 0 ? entries[entries.length - 1].runningBalance : 0;
  const fundTypeLabel = FUND_TYPE_LABELS[fund.fundType] ?? "Unrestricted";

  // Summary stats
  const totalDebits  = entries.reduce((s, e) => s + (e.debit  ?? 0), 0);
  const totalCredits = entries.reduce((s, e) => s + (e.credit ?? 0), 0);

  return (
    <AppLayout title={`Fund Ledger — ${fund.name}`}>
      <div className="p-6 max-w-6xl mx-auto">
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => setLocation("/funds")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Funds
        </Button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold">{fund.name}</h1>
            <Badge variant="outline">{fundTypeLabel}</Badge>
          </div>
          {fund.description && (
            <p className="text-sm text-muted-foreground mb-2">{fund.description}</p>
          )}
          <p className="text-muted-foreground text-sm">
            Fund Activity Ledger &nbsp;·&nbsp;
            <span className={`font-semibold ${finalBalance < 0 ? "text-destructive" : "text-foreground"}`}>
              {fmt(finalBalance)}
            </span>{" "}
            net position
            <span className="ml-2 text-xs text-muted-foreground/70">(income, expenses &amp; equity entries only — matches fund card balance)</span>
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Income / Credits</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(totalCredits)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Expenses / Debits</p>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{fmt(totalDebits)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Net Position</p>
            <p className={`text-xl font-bold ${finalBalance < 0 ? "text-destructive" : "text-foreground"}`}>
              {fmt(finalBalance)}
            </p>
          </div>
        </div>

        {/* Ledger table */}
        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center text-muted-foreground">
            <p className="font-medium">No GL activity for this fund yet.</p>
            <p className="text-sm mt-1">Transactions and journal entries tagged to this fund will appear here once posted.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right w-32">Debit</TableHead>
                  <TableHead className="text-right w-32">Credit</TableHead>
                  <TableHead className="text-right w-36">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.date ? formatDate(e.date) : "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.accountCode}</span>
                        <span>{e.accountName}</span>
                        {e.accountType && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ACCOUNT_TYPE_COLORS[String(e.accountType).toUpperCase()] ?? ""}`}>
                            {e.accountType}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{e.description ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {e.reference ? (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{e.reference}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">{e.sourceType}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono text-rose-600 dark:text-rose-400">
                      {e.debit != null ? fmt(e.debit) : ""}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono text-emerald-600 dark:text-emerald-400">
                      {e.credit != null ? fmt(e.credit) : ""}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-mono font-medium ${e.runningBalance < 0 ? "text-destructive" : ""}`}
                    >
                      {fmt(e.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
