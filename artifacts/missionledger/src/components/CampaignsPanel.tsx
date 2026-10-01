import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Plus, Target, Archive, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";
import { useGetFunds } from "@workspace/api-client-react";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  fundId: string | null;
  goalAmount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  pledgeCount: number;
  pledgedTotal: number;
  collectedTotal: number;
  percentOfGoal: number;
}

export function CampaignsPanel({ onChanged }: { onChanged?: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const { data: funds = [] } = useGetFunds();

  async function load() {
    setLoading(true);
    try {
      const res = await authJsonFetch("/api/pledge-campaigns");
      const data = res.ok ? await readJsonSafe<Campaign[]>(res) : null;
      setCampaigns(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await authJsonFetch("/api/pledge-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          description: fd.get("description") || undefined,
          fundId: fd.get("fundId") || undefined,
          goalAmount: Number(fd.get("goalAmount")),
          startDate: fd.get("startDate") || undefined,
          endDate: fd.get("endDate") || undefined,
        }),
      });
      if (!res.ok) {
        const body = await readJsonSafe<{ error?: string }>(res);
        throw new Error(body?.error || "Failed to create campaign");
      }
      toast.success("Campaign created");
      setOpen(false);
      (e.target as HTMLFormElement).reset();
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to create campaign");
    }
  }

  async function handleArchive(campaign: Campaign) {
    if (!confirm(`Archive "${campaign.name}"? It will stop appearing as a pledge option, but existing pledges keep their link to it.`)) return;
    try {
      const res = await authJsonFetch(`/api/pledge-campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error("Failed to archive campaign");
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive campaign");
    }
  }

  if (!loading && campaigns.length === 0 && !open) {
    return (
      <div className="mb-6">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Target className="w-4 h-4 mr-2" /> Start a Giving Campaign</Button>
          </DialogTrigger>
          <CampaignFormDialog funds={funds as any[]} onSubmit={handleCreate} />
        </Dialog>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-muted/30"
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Target className="w-4 h-4" /> Giving Campaigns
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New Campaign
            </Button>
          </DialogTrigger>
          <CampaignFormDialog funds={funds as any[]} onSubmit={handleCreate} />
        </Dialog>
      </button>

      {expanded && (
        <div className="p-5 space-y-4">
          {campaigns.filter((c) => c.isActive).map((c) => (
            <div key={c.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="font-medium">{c.name}</div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {formatCurrency(c.pledgedTotal)} pledged of {formatCurrency(c.goalAmount)} ({c.percentOfGoal}%)
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Archive campaign" onClick={() => handleArchive(c)}>
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, c.percentOfGoal)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {c.pledgeCount} pledge{c.pledgeCount !== 1 ? "s" : ""} &bull; {formatCurrency(c.collectedTotal)} collected so far
              </div>
            </div>
          ))}
          {campaigns.filter((c) => c.isActive).length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">No active campaigns. Start one to track progress toward a giving goal.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignFormDialog({ funds, onSubmit }: { funds: any[]; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader><DialogTitle>New Giving Campaign</DialogTitle></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4 pt-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Campaign Name</label>
          <Input name="name" placeholder="e.g. Building Fund" required />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <Input name="description" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Goal Amount ($)</label>
            <Input name="goalAmount" type="number" step="0.01" min="0" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Fund</label>
            <select name="fundId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">-- No Fund --</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Start Date</label>
            <Input name="startDate" type="date" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">End Date</label>
            <Input name="endDate" type="date" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button type="submit">Save Campaign</Button>
        </div>
      </form>
    </DialogContent>
  );
}
