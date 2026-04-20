import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetBankAccounts, useCreateBankAccount, useDeleteBankAccount, useGetFunds } from "@workspace/api-client-react";
import { useChartOfAccounts } from "@/hooks/use-chart-of-accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Banknote, CreditCard, Link2, Link2Off, RefreshCw, ArrowLeftRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { usePlaidLink } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";
import { authJsonFetch } from "@/lib/auth-fetch";

/** Map Plaid Link metadata.accounts to the Plaid account_id for this MissionLedger bank row. */
function resolvePlaidAccountIdFromLinkMetadata(
  account: { lastFour?: string | null },
  metadata: { accounts?: Array<{ id: string; mask?: string | null }> } | null | undefined,
): string | undefined {
  const accs = metadata?.accounts;
  if (!accs?.length) return undefined;
  const mask = String(account.lastFour ?? "").trim();
  if (mask) {
    const match = accs.filter((a) => String(a.mask ?? "") === mask);
    if (match.length === 1) return match[0].id;
  }
  if (accs.length === 1) return accs[0].id;
  return undefined;
}

function PlaidLinkButton({ account, onSuccess }: { account: any; onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchLinkToken = async () => {
    setLoadingToken(true);
    try {
      const res = await authJsonFetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to get link token");
      setLinkToken(json.linkToken);
    } catch (err: any) {
      toast.error(err.message || "Plaid not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to connect banks.");
    } finally {
      setLoadingToken(false);
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      const res = await authJsonFetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken,
          bankAccountId: account.id,
          institutionName: metadata?.institution?.name || null,
          plaidAccountId: resolvePlaidAccountIdFromLinkMetadata(account, metadata) ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to link bank");
      toast.success(`${account.name} linked with Plaid successfully!`);
      onSuccess();
      setLinkToken(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to link bank account");
    }
  }, [account.id, account.name, onSuccess]);

  const { open: openPlaid, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: onPlaidSuccess,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await authJsonFetch(`/api/plaid/sync/${account.id}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      let msg = `Synced ${json.imported} transaction${json.imported !== 1 ? "s" : ""} from ${account.plaidInstitutionName || "bank"}`;
      if (json.voidedMisattributed > 0) {
        msg += `. Removed ${json.voidedMisattributed} that belonged to another account at this institution.`;
      }
      toast.success(msg);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync transactions");
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(`Unlink ${account.name} from Plaid? Existing transactions will remain.`)) return;
    try {
      const res = await authJsonFetch(`/api/plaid/unlink/${account.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink");
      toast.success("Bank account unlinked from Plaid");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to unlink");
    }
  };

  if (account.isPlaidLinked) {
    return (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleUnlink}
        >
          <Link2Off className="w-3 h-3 mr-1" />
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      onClick={() => {
        if (linkToken && ready) {
          openPlaid();
        } else {
          fetchLinkToken().then(() => {});
        }
      }}
      disabled={loadingToken}
    >
      {loadingToken ? (
        <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Connecting...</>
      ) : (
        <><Link2 className="w-3 h-3 mr-1" /> Link via Plaid</>
      )}
    </Button>
  );
}

function PlaidLinkButtonWithToken({ account, onSuccess }: { account: any; onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Pre-fetch the token as soon as the card renders so it's ready on first click
  useEffect(() => {
    let cancelled = false;
    if (account.isPlaidLinked) return;
    authJsonFetch("/api/plaid/create-link-token", { method: "POST" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.linkToken) setLinkToken(json.linkToken);
        else setTokenError(json.error || "Failed to get Plaid token");
      })
      .catch((err) => {
        if (!cancelled) setTokenError(err.message || "Plaid unavailable");
      });
    return () => { cancelled = true; };
  }, [account.id, account.isPlaidLinked]);

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      const res = await authJsonFetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken,
          bankAccountId: account.id,
          institutionName: metadata?.institution?.name || null,
          plaidAccountId: resolvePlaidAccountIdFromLinkMetadata(account, metadata) ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to link bank");
      toast.success(`${account.name} linked with Plaid!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to link bank account");
    }
  }, [account.id, account.name, onSuccess]);

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken || "",
    onSuccess: onPlaidSuccess,
  });

  // Direct user-gesture click → open immediately (token already pre-fetched)
  const handleConnect = () => {
    if (tokenError) {
      toast.error(tokenError);
      return;
    }
    if (plaidReady) {
      openPlaid();
    } else {
      toast.info("Plaid is still loading, please try again in a moment.");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await authJsonFetch(`/api/plaid/sync/${account.id}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const totalAcc = json.totalForThisAccount ?? json.total ?? 0;
      let msg =
        json.imported > 0
          ? `Imported ${json.imported} new transaction${json.imported !== 1 ? "s" : ""}${json.skipped > 0 ? ` (${json.skipped} already existed)` : ""}`
          : totalAcc === 0 && (json.totalFetched ?? 0) > 0
            ? "No transactions for this account in the sync window (other accounts at this bank may have activity)."
            : `All ${totalAcc} transaction${totalAcc !== 1 ? "s" : ""} already up to date`;
      if (json.voidedMisattributed > 0) {
        msg += ` Removed ${json.voidedMisattributed} that were imported for the wrong sub-account.`;
      }
      toast.success(msg);
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(`Unlink ${account.name} from Plaid?`)) return;
    try {
      await authJsonFetch(`/api/plaid/unlink/${account.id}`, { method: "DELETE" });
      toast.success("Unlinked from Plaid");
      onSuccess();
    } catch {
      toast.error("Failed to unlink");
    }
  };

  if (account.isPlaidLinked) {
    return (
      <div className="flex gap-1 flex-wrap">
        <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
          <Building2 className="w-3 h-3 mr-1" />
          {account.plaidInstitutionName || "Plaid Linked"}
        </Badge>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync"}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-muted-foreground hover:text-destructive" onClick={handleUnlink}>
          <Link2Off className="w-3 h-3 mr-1" />
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      onClick={handleConnect}
      disabled={!plaidReady && !tokenError}
      title={tokenError || (!plaidReady ? "Preparing Plaid…" : "Link your bank account")}
    >
      {!plaidReady && !tokenError ? (
        <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Preparing…</>
      ) : (
        <><Link2 className="w-3 h-3 mr-1" /> Link Bank via Plaid</>
      )}
    </Button>
  );
}

/** Pick which Chart of Accounts ASSET (cash) row this bank register updates — e.g. link RBFCU to 1015. */
function BankGlAccountLink({
  account,
  onSaved,
}: {
  account: {
    id: string;
    name: string;
    accountType: string;
    lastFour?: string | null;
    currentBalance: number;
    glAccountId?: string | null;
    isActive?: boolean;
  };
  onSaved: () => void;
}) {
  const { data: coa = [], isLoading } = useChartOfAccounts();
  const [saving, setSaving] = useState(false);

  const assets = coa
    .filter((a) => a.type === "ASSET" && a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  async function saveGlLink(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const glAccountId = v === "" ? null : v;
    setSaving(true);
    try {
      const res = await authJsonFetch(`/api/bank-accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: account.name,
          accountType: account.accountType,
          currentBalance: account.currentBalance,
          lastFour: account.lastFour ?? null,
          glAccountId,
          isActive: account.isActive !== false,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not save link");
      toast.success("Chart of Accounts link saved.");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
      <Label className="text-xs font-medium">Linked GL account (Chart of Accounts)</Label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        disabled={isLoading || saving}
        value={account.glAccountId ?? ""}
        onChange={saveGlLink}
      >
        <option value="">— Select cash account (e.g. 1015) —</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} — {a.name}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Choose the same asset account you use on the chart for this bank so the register and general ledger stay in sync.
      </p>
    </div>
  );
}

function TransferBetweenBanksDialog({
  bankAccounts,
  open,
  onOpenChange,
  onSuccess,
}: {
  bankAccounts: Array<{ id: string; name: string; glAccountId?: string | null }>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { data: funds = [] } = useGetFunds();
  const today = new Date().toISOString().slice(0, 10);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [dateStr, setDateStr] = useState(today);
  const [memo, setMemo] = useState("");
  const [fundId, setFundId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fromBank = bankAccounts.find((b) => b.id === fromId);
  const toBank = bankAccounts.find((b) => b.id === toId);
  const glLinked = !!(fromBank?.glAccountId && toBank?.glAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId) {
      toast.error("Choose two different bank accounts.");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a positive amount.");
      return;
    }
    if (!glLinked) {
      toast.error("Both accounts must have a linked GL cash account (Chart of Accounts).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authJsonFetch("/api/bank-accounts/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromBankAccountId: fromId,
          toBankAccountId: toId,
          amount: amt,
          date: dateStr,
          memo: memo.trim() || undefined,
          fundId: fundId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "Transfer failed");
      toast.success((json as { message?: string }).message ?? "Transfer recorded.");
      onSuccess();
      onOpenChange(false);
      setAmount("");
      setMemo("");
      setFundId("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            Transfer between bank accounts
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Moves cash on the general ledger from one linked cash account to another and adds matching lines in both bank registers.
            Each bank must be linked to an ASSET account on the Chart of Accounts (e.g. 1010, 1020).
          </p>
          <div className="space-y-1">
            <Label htmlFor="xfer-from">From</Label>
            <select
              id="xfer-from"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              required
            >
              <option value="">Select account…</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {!b.glAccountId ? " (no GL link)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="xfer-to">To</Label>
            <select
              id="xfer-to"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              required
            >
              <option value="">Select account…</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {!b.glAccountId ? " (no GL link)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="xfer-amt">Amount</Label>
              <Input
                id="xfer-amt"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="xfer-date">Date</Label>
              <Input id="xfer-date" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
            </div>
          </div>
          {(funds as { id: string; name: string }[]).length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="xfer-fund">Fund (optional)</Label>
              <select
                id="xfer-fund"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                <option value="">—</option>
                {(funds as { id: string; name: string }[]).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="xfer-memo">Memo (optional)</Label>
            <Input id="xfer-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Open RBFCU account" />
          </div>
          {fromBank && toBank && !glLinked && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              Link both banks to cash accounts on the Chart of Accounts before transferring.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !glLinked}>
              {submitting ? "Recording…" : "Record transfer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BankAccountsPage() {
  const queryClient = useQueryClient();
  const { data: bankAccounts = [], isLoading } = useGetBankAccounts();
  const createBankAccount = useCreateBankAccount();
  const deleteBankAccount = useDeleteBankAccount();
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createBankAccount.mutateAsync({
        data: {
          name: fd.get("name") as string,
          accountType: fd.get("accountType") as string,
          lastFour: (fd.get("lastFour") as string) || undefined,
          currentBalance: Number(fd.get("currentBalance")) || 0,
        },
      });
      toast.success("Bank account added successfully");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to create bank account");
    }
  };

  const refreshAccounts = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
  };

  return (
    <AppLayout title="Bank Accounts">
      <div className="flex justify-end gap-2 mb-6 flex-wrap">
        <TransferBetweenBanksDialog
          bankAccounts={bankAccounts as { id: string; name: string; glAccountId?: string | null }[]}
          open={transferOpen}
          onOpenChange={setTransferOpen}
          onSuccess={() => {
            refreshAccounts();
            queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
          }}
        />
        <Button variant="outline" className="shadow-sm" onClick={() => setTransferOpen(true)}>
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          Transfer between banks
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Account Name</label>
                <Input name="name" placeholder="e.g. General Checking" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Account Type</label>
                  <select name="accountType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                    <option value="CHECKING">Checking</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="MONEY_MARKET">Money Market</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Last 4 Digits</label>
                  <Input name="lastFour" maxLength={4} pattern="[0-9]{4}" placeholder="1234" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Opening Balance ($)</label>
                <Input name="currentBalance" type="number" step="0.01" defaultValue="0" />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createBankAccount.isPending}>
                  {createBankAccount.isPending ? "Saving..." : "Add Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading accounts...</div>
      ) : (bankAccounts as any[]).length === 0 ? (
        <div className="text-center py-16">
          <Banknote className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Bank Accounts</h3>
          <p className="text-muted-foreground">Add your organization's bank accounts to start tracking transactions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(bankAccounts as any[]).map((account) => (
            <Card key={account.id} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{account.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{account.accountType}{account.lastFour ? ` •••• ${account.lastFour}` : ""}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this bank account?")) deleteBankAccount.mutate({ id: account.id }); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className={`text-2xl font-bold ${account.currentBalance >= 0 ? "text-foreground" : "text-destructive"}`}>
                    {formatCurrency(account.currentBalance)}
                  </p>
                </div>
                <BankGlAccountLink
                  account={account}
                  onSaved={() => {
                    refreshAccounts();
                    queryClient.invalidateQueries({ queryKey: ["chart-of-accounts"] });
                  }}
                />
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${account.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {account.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <PlaidLinkButtonWithToken account={account} onSuccess={refreshAccounts} />
                  {account.isPlaidLinked && account.plaidLastSyncedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(account.plaidLastSyncedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
