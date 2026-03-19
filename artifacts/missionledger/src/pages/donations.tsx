import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useDonations, useCreateDonation, useDeleteDonation } from "@/hooks/use-donations";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useFunds } from "@/hooks/use-funds";
import { useAccounts } from "@/hooks/use-accounts";

const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Restricted (Temp)",
  RESTRICTED_PERM: "Restricted (Perm)",
  BOARD_DESIGNATED: "Board Designated",
};
function fundLabel(f: any) {
  const type = FUND_TYPE_LABELS[f.fundType] ?? "Unrestricted";
  return `${f.name} — ${type}`;
}

export default function DonationsPage() {
  const { data: donations = [], isLoading } = useDonations();
  const createDonation = useCreateDonation();
  const deleteDonation = useDeleteDonation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: funds = [] } = useFunds();
  const { data: accounts = [] } = useAccounts();
  const revenueAccounts = accounts.filter(a => a.type === "REVENUE");
  const assetAccounts = accounts.filter(a => a.type === "ASSET");

  const filtered = donations.filter(d => 
    d.donorName.toLowerCase().includes(search.toLowerCase()) || 
    (d.donorEmail && d.donorEmail.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createDonation.mutateAsync({
        data: {
          donorName: fd.get("donorName") as string,
          donorEmail: fd.get("donorEmail") as string,
          amount: Number(fd.get("amount")),
          date: fd.get("date") as string,
          type: fd.get("type") as string,
          fundId: fd.get("fundId") as string || undefined,
          accountId: fd.get("accountId") as string,
          cashAccountId: fd.get("cashAccountId") as string,
          notes: fd.get("notes") as string,
        }
      });
      toast.success("Donation recorded successfully");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create donation");
    }
  };

  return (
    <AppLayout title="Donations">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search donors..." className="pl-9 bg-card" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Record Donation</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>Record New Donation</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Donor Name</label>
                  <Input name="donorName" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email (Optional)</label>
                  <Input name="donorEmail" type="email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Amount ($)</label>
                  <Input name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date</label>
                  <Input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Type</label>
                  <select name="type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                    <option value="ONLINE">Online</option>
                    <option value="CHECK">Check</option>
                    <option value="CASH">Cash</option>
                    <option value="IN_KIND">In Kind</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Fund (Optional)</label>
                  <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">-- No Fund --</option>
                    {funds.map(f => <option key={f.id} value={f.id}>{fundLabel(f)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-muted/50 p-3 rounded-lg border border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Revenue Account (Cr)</label>
                  <select name="accountId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                    <option value="">Select Account</option>
                    {revenueAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Deposit Account (Dr)</label>
                  <select name="cashAccountId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                    <option value="">Select Account</option>
                    {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Input name="notes" />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createDonation.isPending}>
                  {createDonation.isPending ? "Saving..." : "Save Donation"}
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
              <TableHead>Type</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading donations...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No donations found</TableCell></TableRow>
            ) : (
              filtered.map(don => (
                <TableRow key={don.id}>
                  <TableCell className="font-medium">{formatDate(don.date)}</TableCell>
                  <TableCell>
                    <div>{don.donorName}</div>
                    {don.donorEmail && <div className="text-xs text-muted-foreground">{don.donorEmail}</div>}
                  </TableCell>
                  <TableCell><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">{don.type}</span></TableCell>
                  <TableCell className="text-muted-foreground">{don.fund?.name || "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(don.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" 
                      onClick={() => { if(confirm('Delete this donation?')) deleteDonation.mutate({id: don.id}) }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
