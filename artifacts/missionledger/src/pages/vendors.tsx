import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetVendors, useCreateVendor, useDeleteVendor } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

export default function VendorsPage() {
  const { data: vendors = [], isLoading } = useGetVendors();
  const createVendor = useCreateVendor();
  const deleteVendor = useDeleteVendor();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (vendors as any[]).filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.email && v.email.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createVendor.mutateAsync({
        data: {
          name: fd.get("name") as string,
          email: (fd.get("email") as string) || undefined,
          phone: (fd.get("phone") as string) || undefined,
          address: (fd.get("address") as string) || undefined,
          taxId: (fd.get("taxId") as string) || undefined,
        },
      });
      toast.success("Vendor added successfully");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to create vendor");
    }
  };

  return (
    <AppLayout title="Vendors">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader><DialogTitle>Add New Vendor</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Vendor Name</label>
                <Input name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email</label>
                  <Input name="email" type="email" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Phone</label>
                  <Input name="phone" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Address</label>
                <Input name="address" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Tax ID / EIN</label>
                <Input name="taxId" />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createVendor.isPending}>
                  {createVendor.isPending ? "Saving..." : "Add Vendor"}
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tax ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading vendors...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Building2 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">No vendors found. Add your first vendor to get started.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((vendor: any) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">{vendor.name}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.email || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.phone || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{vendor.taxId || "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${vendor.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {vendor.isActive ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this vendor?")) deleteVendor.mutate({ id: vendor.id }); }}>
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
