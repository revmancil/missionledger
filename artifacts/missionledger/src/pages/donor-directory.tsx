import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Search, Users, Pencil } from "lucide-react";
import { toast } from "sonner";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";
import { useAuth } from "@/hooks/use-auth";
import { giverDirectoryLabel } from "@/lib/org-terminology";

interface Giver {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
}

export default function DonorDirectoryPage() {
  const { user } = useAuth();
  const [givers, setGivers] = useState<Giver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Giver | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await authJsonFetch(`/api/donor-directory?activeOnly=false${search ? `&search=${encodeURIComponent(search)}` : ""}`);
      const data = res.ok ? await readJsonSafe<Giver[]>(res) : null;
      setGivers(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [search]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email") || undefined,
      phone: fd.get("phone") || undefined,
      address: fd.get("address") || undefined,
      notes: fd.get("notes") || undefined,
    };
    try {
      const res = await authJsonFetch(editing ? `/api/donor-directory/${editing.id}` : "/api/donor-directory", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await readJsonSafe<{ error?: string }>(res);
        throw new Error(body?.error || "Failed to save");
      }
      toast.success(editing ? "Giver updated" : "Giver added");
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save giver");
    }
  }

  async function handleDeactivate(giver: Giver) {
    if (!confirm(`Deactivate ${giver.name}? Their giving history is kept; they just stop showing up when recording new gifts.`)) return;
    try {
      const res = await authJsonFetch(`/api/donor-directory/${giver.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to deactivate");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate giver");
    }
  }

  const label = giverDirectoryLabel(user?.organizationType);

  return (
    <AppLayout title={label}>
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20" onClick={() => setEditing(null)}>
              <Plus className="w-4 h-4 mr-2" /> Add Giver
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>{editing ? "Edit Giver" : "Add Giver"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input name="name" required defaultValue={editing?.name ?? ""} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email</label>
                  <Input name="email" type="email" defaultValue={editing?.email ?? ""} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Phone</label>
                  <Input name="phone" defaultValue={editing?.phone ?? ""} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Address</label>
                <Input name="address" defaultValue={editing?.address ?? ""} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Input name="notes" defaultValue={editing?.notes ?? ""} />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit">{editing ? "Save Changes" : "Add Giver"}</Button>
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : givers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">No givers yet. Add one, or they'll be added automatically the first time you record a gift for them.</p>
                  </TableCell>
                </TableRow>
              ) : givers.map((g) => (
                <TableRow key={g.id} className={!g.isActive ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.phone || "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${g.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {g.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(g); setOpen(true); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {g.isActive && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeactivate(g)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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
