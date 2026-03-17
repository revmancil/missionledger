import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAccounts, useCreateAccount, useDeleteAccount } from "@/hooks/use-accounts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);

  // Group by type
  const grouped = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const types = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createAccount.mutateAsync({
        data: {
          code: fd.get("code") as string,
          name: fd.get("name") as string,
          type: fd.get("type") as string,
          description: fd.get("description") as string,
          isActive: true
        }
      });
      toast.success("Account created successfully");
      setOpen(false);
    } catch (err: any) {
      toast.error("Failed to create account");
    }
  };

  return (
    <AppLayout title="Chart of Accounts">
      <div className="flex justify-between items-center mb-6">
        <p className="text-muted-foreground">Manage your General Ledger accounts.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New GL Account</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Account Code</label>
                  <Input name="code" required placeholder="e.g. 4000" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Account Type</label>
                  <select name="type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                    {types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Account Name</label>
                <Input name="name" required placeholder="e.g. General Donations" />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createAccount.isPending}>Save Account</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-8">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading chart of accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border border-dashed rounded-xl text-muted-foreground">No accounts configured yet.</div>
        ) : (
          types.map(type => {
            const list = grouped[type] || [];
            if (list.length === 0) return null;
            return (
              <div key={type} className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-6 py-3 border-b border-border font-semibold text-sm tracking-wider text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  {type}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.sort((a,b) => a.code.localeCompare(b.code)).map(acct => (
                      <TableRow key={acct.id}>
                        <TableCell className="font-mono font-medium text-muted-foreground">{acct.code}</TableCell>
                        <TableCell className="font-medium">{acct.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" 
                            onClick={() => { if(confirm('Delete account?')) deleteAccount.mutate({id: acct.id}) }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
