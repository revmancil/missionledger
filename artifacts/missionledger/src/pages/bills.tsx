import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetBills, useCreateBill, useDeleteBill } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGetVendors, useGetFunds } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  PARTIAL: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  VOID: "bg-muted text-muted-foreground",
};

export default function BillsPage() {
  const { data: bills = [], isLoading } = useGetBills();
  const createBill = useCreateBill();
  const deleteBill = useDeleteBill();
  const { data: vendors = [] } = useGetVendors();
  const { data: funds = [] } = useGetFunds();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (bills as any[]).filter((b) =>
    b.description.toLowerCase().includes(search.toLowerCase()) ||
    (b.vendor?.name && b.vendor.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createBill.mutateAsync({
        data: {
          description: fd.get("description") as string,
          amount: Number(fd.get("amount")),
          dueDate: fd.get("dueDate") as string,
          vendorId: (fd.get("vendorId") as string) || undefined,
          fundId: (fd.get("fundId") as string) || undefined,
        },
      });
      toast.success("Bill created successfully");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create bill");
    }
  };

  return (
    <AppLayout title="Bills">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bills..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> New Bill</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader><DialogTitle>Create New Bill</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <Input name="description" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Amount ($)</label>
                  <Input name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input name="dueDate" type="date" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Vendor (Optional)</label>
                <select name="vendorId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- No Vendor --</option>
                  {(vendors as any[]).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Fund (Optional)</label>
                <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- No Fund --</option>
                  {(funds as any[]).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createBill.isPending}>
                  {createBill.isPending ? "Saving..." : "Create Bill"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Due Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading bills...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">No bills found. Create your first bill to get started.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((bill: any) => (
              <TableRow key={bill.id}>
                <TableCell className="font-medium">{formatDate(bill.dueDate)}</TableCell>
                <TableCell>{bill.description}</TableCell>
                <TableCell className="text-muted-foreground">{bill.vendor?.name || "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLORS[bill.status] || "bg-muted"}`}>
                    {bill.status}
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(bill.amount)}</TableCell>
                <TableCell className="text-right text-emerald-600">{formatCurrency(bill.paidAmount || 0)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this bill?")) deleteBill.mutate({ id: bill.id }); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    </AppLayout>
  );
}
