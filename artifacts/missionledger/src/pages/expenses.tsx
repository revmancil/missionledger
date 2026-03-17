import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetExpenses, useCreateExpense, useDeleteExpense } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGetFunds, useGetAccounts, useGetVendors } from "@workspace/api-client-react";

const EXPENSE_CATEGORIES = [
  "Salaries", "Rent", "Utilities", "Office Supplies", "Marketing",
  "Travel", "Technology", "Program Expenses", "Professional Services", "Miscellaneous"
];

export default function ExpensesPage() {
  const { data: expenses = [], isLoading } = useGetExpenses();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const { data: funds = [] } = useGetFunds();
  const { data: accounts = [] } = useGetAccounts();
  const { data: vendors = [] } = useGetVendors();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const expenseAccounts = accounts.filter((a: any) => a.type === "EXPENSE");
  const assetAccounts = accounts.filter((a: any) => a.type === "ASSET");

  const filtered = expenses.filter((e: any) =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createExpense.mutateAsync({
        data: {
          description: fd.get("description") as string,
          amount: Number(fd.get("amount")),
          date: fd.get("date") as string,
          category: fd.get("category") as string,
          fundId: (fd.get("fundId") as string) || undefined,
          accountId: (fd.get("accountId") as string) || undefined,
          cashAccountId: (fd.get("cashAccountId") as string) || undefined,
          vendorId: (fd.get("vendorId") as string) || undefined,
          notes: fd.get("notes") as string,
        },
      });
      toast.success("Expense recorded successfully");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create expense");
    }
  };

  return (
    <AppLayout title="Expenses">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Record Expense</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader><DialogTitle>Record New Expense</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <Input name="description" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Amount ($)</label>
                  <Input name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date</label>
                  <Input name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Category</label>
                  <select name="category" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                    {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Vendor (Optional)</label>
                  <select name="vendorId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">-- No Vendor --</option>
                    {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Fund (Optional)</label>
                <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- No Fund --</option>
                  {funds.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-muted/50 p-3 rounded-lg border border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Expense Account (Dr)</label>
                  <select name="accountId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">Select Account</option>
                    {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Payment Account (Cr)</label>
                  <select name="cashAccountId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                    <option value="">Select Account</option>
                    {assetAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Input name="notes" />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createExpense.isPending}>
                  {createExpense.isPending ? "Saving..." : "Save Expense"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading expenses...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
            ) : filtered.map((exp: any) => (
              <TableRow key={exp.id}>
                <TableCell className="font-medium">{formatDate(exp.date)}</TableCell>
                <TableCell>{exp.description}</TableCell>
                <TableCell><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">{exp.category}</span></TableCell>
                <TableCell className="text-muted-foreground">{exp.vendor?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{exp.fund?.name || "—"}</TableCell>
                <TableCell className="text-right font-semibold text-orange-600">{formatCurrency(exp.amount)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this expense?")) deleteExpense.mutate({ id: exp.id }); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
