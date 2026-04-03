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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AccountLedger() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<{ account: any; entries: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem("ml_token");
    fetch(apiUrl(`/api/chart-of-accounts/${id}/ledger`), {
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
      <AppLayout title="Account ledger">
        <div className="p-8 text-muted-foreground">Loading ledger…</div>
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout title="Account ledger">
        <div className="p-8 text-destructive">Error: {error}</div>
      </AppLayout>
    );
  }
  if (!data) return null;

  const { account, entries } = data;
  const finalBalance = entries.length > 0 ? entries[entries.length - 1].runningBalance : 0;

  return (
    <AppLayout title={`Ledger — ${account.name}`}>
    <div className="p-6 max-w-6xl mx-auto">
      <Button variant="ghost" className="mb-4 -ml-2" onClick={() => setLocation("/accounts")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Chart of Accounts
      </Button>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-sm text-muted-foreground">{account.code}</span>
          <h1 className="text-2xl font-semibold">{account.name}</h1>
          <Badge variant="outline">{account.type}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          General Ledger Subledger &nbsp;·&nbsp;
          <span className="font-medium text-foreground">{fmt(finalBalance)}</span> ending balance
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">No transactions posted to this account yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead className="text-right w-32">Debit</TableHead>
              <TableHead className="text-right w-32">Credit</TableHead>
              <TableHead className="text-right w-36">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{formatDate(e.date)}</TableCell>
                <TableCell className="text-sm">{e.description ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {e.reference ? (
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{e.reference}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">{e.sourceType}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.fundName ?? "—"}</TableCell>
                <TableCell className="text-right text-sm font-mono">
                  {e.debit != null ? fmt(e.debit) : ""}
                </TableCell>
                <TableCell className="text-right text-sm font-mono">
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
      )}
    </div>
  );
}
