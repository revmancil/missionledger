import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetBankAccounts, useCreateBankAccount, useDeleteBankAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Banknote, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function BankAccountsPage() {
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
    } catch (err: any) {
      toast.error(err.message || "Failed to create bank account");
    }
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
                <div className="mt-3 flex gap-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${account.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
