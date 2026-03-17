import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useFunds, useCreateFund, useDeleteFund } from "@/hooks/use-funds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function FundsPage() {
  const { data: funds = [], isLoading } = useFunds();
  const createFund = useCreateFund();
  const deleteFund = useDeleteFund();
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createFund.mutateAsync({
        data: {
          name: fd.get("name") as string,
          description: fd.get("description") as string,
          isActive: true
        }
      });
      toast.success("Fund created successfully");
      setOpen(false);
    } catch (err: any) {
      toast.error("Failed to create fund");
    }
  };

  return (
    <AppLayout title="Funds">
      <div className="flex justify-between items-center mb-6">
        <p className="text-muted-foreground">Manage restricted and unrestricted funds.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Fund</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Fund</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Fund Name</label>
                <Input name="name" required placeholder="e.g. Building Fund" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <Input name="description" placeholder="Optional details..." />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createFund.isPending}>Save Fund</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {funds.map(fund => (
          <div key={fund.id} className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" 
                onClick={() => { if(confirm('Delete fund?')) deleteFund.mutate({id: fund.id}) }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Wallet className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg mb-1">{fund.name}</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">{fund.description || "No description"}</p>
            <div className="pt-4 border-t border-border/50 flex justify-between items-end">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance</span>
              <span className="text-xl font-bold text-foreground">{formatCurrency(fund.balance || 0)}</span>
            </div>
          </div>
        ))}
        {isLoading && <div className="col-span-3 text-center py-12 text-muted-foreground">Loading funds...</div>}
        {!isLoading && funds.length === 0 && <div className="col-span-3 text-center py-12 text-muted-foreground bg-card border border-border border-dashed rounded-xl">No funds created yet.</div>}
      </div>
    </AppLayout>
  );
}
