import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetPledges, useCreatePledge, useDeletePledge } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Search, HandHeart } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGetFunds } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-muted text-muted-foreground",
  DEFAULTED: "bg-red-100 text-red-700",
};

export default function PledgesPage() {
  const { data: pledges = [], isLoading } = useGetPledges();
  const createPledge = useCreatePledge();
  const deletePledge = useDeletePledge();
  const { data: funds = [] } = useGetFunds();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (pledges as any[]).filter((p) =>
    p.donorName.toLowerCase().includes(search.toLowerCase()) ||
    (p.donorEmail && p.donorEmail.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createPledge.mutateAsync({
        data: {
          donorName: fd.get("donorName") as string,
          donorEmail: (fd.get("donorEmail") as string) || undefined,
          totalAmount: Number(fd.get("totalAmount")),
          pledgeDate: fd.get("pledgeDate") as string,
          startDate: (fd.get("startDate") as string) || undefined,
          endDate: (fd.get("endDate") as string) || undefined,
          frequency: (fd.get("frequency") as string) || undefined,
          fundId: (fd.get("fundId") as string) || undefined,
          notes: fd.get("notes") as string,
        },
      });
      toast.success("Pledge recorded successfully");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create pledge");
    }
  };

  return (
    <AppLayout title="Pledges">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pledges..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Record Pledge</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>Record New Pledge</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Donor Name</label>
                  <Input name="donorName" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Donor Email</label>
                  <Input name="donorEmail" type="email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Total Amount ($)</label>
                  <Input name="totalAmount" type="number" step="0.01" min="0" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Pledge Date</label>
                  <Input name="pledgeDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input name="startDate" type="date" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">End Date</label>
                  <Input name="endDate" type="date" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Frequency</label>
                  <select name="frequency" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">-- One Time --</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUALLY">Annually</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Fund</label>
                  <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">-- No Fund --</option>
                    {(funds as any[]).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Input name="notes" />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createPledge.isPending}>
                  {createPledge.isPending ? "Saving..." : "Save Pledge"}
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
              <TableHead>Donor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading pledges...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <HandHeart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">No pledges found. Record your first pledge to get started.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((pledge: any) => (
              <TableRow key={pledge.id}>
                <TableCell className="font-medium">{formatDate(pledge.pledgeDate)}</TableCell>
                <TableCell>
                  <div>{pledge.donorName}</div>
                  {pledge.donorEmail && <div className="text-xs text-muted-foreground">{pledge.donorEmail}</div>}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLORS[pledge.status] || "bg-muted"}`}>
                    {pledge.status}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{pledge.frequency || "One Time"}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(pledge.totalAmount)}</TableCell>
                <TableCell className="text-right text-emerald-600">{formatCurrency(pledge.paidAmount || 0)}</TableCell>
                <TableCell className="text-right text-orange-600">{formatCurrency(pledge.remainingAmount || 0)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this pledge?")) deletePledge.mutate({ id: pledge.id }); }}>
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
