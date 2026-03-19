import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetBankAccounts, useCreateBankAccount, useDeleteBankAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Banknote, CreditCard, Link2, Link2Off, RefreshCw, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePlaidLink } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";

function PlaidLinkButton({ account, onSuccess }: { account: any; onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchLinkToken = async () => {
    setLoadingToken(true);
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        credentials: "include",
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
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken,
          bankAccountId: account.id,
          institutionName: metadata?.institution?.name || null,
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
      const res = await fetch(`/api/plaid/sync/${account.id}`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      toast.success(`Synced ${json.imported} transactions from ${account.plaidInstitutionName || "bank"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync transactions");
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(`Unlink ${account.name} from Plaid? Existing transactions will remain.`)) return;
    try {
      const res = await fetch(`/api/plaid/unlink/${account.id}`, {
        method: "DELETE",
        credentials: "include",
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
    fetch("/api/plaid/create-link-token", { method: "POST", credentials: "include" })
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
      const res = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken,
          bankAccountId: account.id,
          institutionName: metadata?.institution?.name || null,
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
      const res = await fetch(`/api/plaid/sync/${account.id}`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const msg = json.imported > 0
        ? `Imported ${json.imported} new transaction${json.imported !== 1 ? "s" : ""}${json.skipped > 0 ? ` (${json.skipped} already existed)` : ""}`
        : `All ${json.total} transactions already up to date`;
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
      await fetch(`/api/plaid/unlink/${account.id}`, { method: "DELETE", credentials: "include" });
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

export default function BankAccountsPage() {
  const queryClient = useQueryClient();
  const { data: bankAccounts = [], isLoading } = useGetBankAccounts();
  const createBankAccount = useCreateBankAccount();
  const deleteBankAccount = useDeleteBankAccount();
  const [open, setOpen] = useState(false);

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
      <div className="flex justify-end mb-6">
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
