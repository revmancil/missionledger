import { useState, Fragment } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useGetBills,
  useCreateBill,
  useDeleteBill,
  useGetVendors,
  useGetFunds,
} from "@workspace/api-client-react";
import { useChartOfAccounts } from "@/hooks/use-chart-of-accounts";
import { useAuth } from "@/hooks/use-auth";
import { AttachmentPanel } from "@/components/AttachmentPanel";
import { InvoiceIntakeDialog } from "@/components/invoice-intake/InvoiceIntakeDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Plus, Trash2, Search, FileText, ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
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
  const { data: coa = [] } = useChartOfAccounts();
  const { user } = useAuth();
  const isAdmin = ["ADMIN", "MASTER_ADMIN", "PASTOR"].includes(String((user as any)?.role ?? ""));

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const expenseAccounts = (coa as any[]).filter((a) => a.type === "EXPENSE" && a.isActive !== false);

  const filtered = (bills as any[]).filter((b) => {
    const q = search.toLowerCase();
    return (
      (b.description ?? "").toLowerCase().includes(q) ||
      (b.vendor?.name ?? "").toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createBill.mutateAsync({
        data: {
          description: fd.get("description") as string,
          amount: Number(fd.get("amount")),
          dueDate: fd.get("dueDate") as string,
          vendorId: (fd.get("vendorId") as string) || undefined,
          accountId: (fd.get("accountId") as string) || undefined,
          fundId: (fd.get("fundId") as string) || undefined,
        },
      });
      toast.success("Bill recorded");
      setOpen(false);
      form.reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create bill");
    }
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <AppLayout title="Bills">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bills..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <InvoiceIntakeDialog defaultType="bill" />
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="shadow-sm">
                <Plus className="w-4 h-4 mr-2" /> Record Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Record New Bill</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Description</label>
                  <Input name="description" required placeholder="e.g. Office rent — March" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Amount ($)</label>
                    <Input name="amount" type="number" step="0.01" min="0" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Due Date</label>
                    <Input name="dueDate" type="date" required defaultValue={today} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Vendor</label>
                    <select name="vendorId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">-- No Vendor --</option>
                      {(vendors as any[]).map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Fund</label>
                    <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">-- No Fund --</option>
                      {(funds as any[]).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Expense Account</label>
                  <select name="accountId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">-- Select --</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Required so the bill posts to the general ledger when paid.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createBill.isPending}>
                    {createBill.isPending ? "Saving..." : "Save Bill"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden md:table-cell">Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading bills...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">No bills found. Record your first bill to get started.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((bill: any) => {
                  const expanded = expandedId === bill.id;
                  return (
                    <Fragment key={bill.id}>
                      <TableRow
                        className={cn("cursor-pointer hover:bg-muted/40", expanded && "bg-muted/30")}
                        onClick={() => setExpandedId(expanded ? null : bill.id)}
                      >
                        <TableCell>
                          {expanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(bill.dueDate)}</TableCell>
                        <TableCell className="font-medium">{bill.description}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{bill.vendor?.name || "—"}</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center px-2 py-1 rounded-md text-xs font-medium", STATUS_COLORS[bill.status] || "bg-muted")}>
                            {bill.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(bill.amount)}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell text-muted-foreground tabular-nums">
                          {formatCurrency(bill.paidAmount || 0)}
                        </TableCell>
                        <TableCell>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this bill?")) deleteBill.mutate({ id: bill.id });
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={8} className="py-3">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Paperclip className="h-3.5 w-3.5" />
                                Attach the vendor invoice for this bill.
                              </div>
                              <AttachmentPanel entityType="BILL" entityId={bill.id} variant="compact" />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
