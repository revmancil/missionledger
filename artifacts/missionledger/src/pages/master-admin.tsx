import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Shield, Building2, Users, Activity, Ban, CheckCircle2,
  Eye, Search, AlertTriangle, RefreshCcw, ChevronRight, X,
  Lock
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Request failed");
  }
  return res.json();
}

type OrgRow = {
  id: string;
  name: string;
  companyCode: string;
  organizationType: string;
  isActive: boolean;
  subscriptionStatus: string;
  ein: string;
  email?: string;
  phone?: string;
  createdAt: string;
  closedUntil?: string;
  userCount: number;
};

type OrgDetail = OrgRow & {
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }>;
};

type Stats = {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
};

function statusBadge(org: OrgRow) {
  if (!org.isActive) return <Badge variant="destructive">Suspended</Badge>;
  const map: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800 border-green-200",
    TRIAL: "bg-blue-100 text-blue-800 border-blue-200",
    CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
    INACTIVE: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <Badge variant="outline" className={map[org.subscriptionStatus] || map.INACTIVE}>
      {org.subscriptionStatus}
    </Badge>
  );
}

export default function MasterAdminPage() {
  const { isPlatformAdmin, isImpersonating } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [suspendDialog, setSuspendDialog] = useState<OrgRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);

  // Redirect non-platform-admins
  if (!isPlatformAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Shield className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Platform Admin access required.</p>
          <Button onClick={() => setLocation("/dashboard")}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["master-admin-stats"],
    queryFn: () => apiFetch("/api/master-admin/stats"),
  });

  const { data: orgs = [], isLoading: orgsLoading } = useQuery<OrgRow[]>({
    queryKey: ["master-admin-orgs"],
    queryFn: () => apiFetch("/api/master-admin/organizations"),
  });

  const { data: orgDetail, isLoading: detailLoading } = useQuery<OrgDetail>({
    queryKey: ["master-admin-org-detail", selectedOrg?.id],
    queryFn: () => apiFetch(`/api/master-admin/organizations/${selectedOrg!.id}`),
    enabled: !!selectedOrg,
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/master-admin/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive, suspendedReason: suspendReason }),
      }),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? "Organization activated" : "Organization suspended");
      qc.invalidateQueries({ queryKey: ["master-admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["master-admin-stats"] });
      setSuspendDialog(null);
      setSuspendReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleImpersonate = async (org: OrgRow) => {
    setImpersonating(org.id);
    try {
      await apiFetch(`/api/master-admin/impersonate/${org.id}`, { method: "POST" });
      toast.success(`Now viewing as ${org.name}`);
      // Refresh auth context and navigate to dashboard
      window.location.href = `${BASE}/dashboard`;
    } catch (e: any) {
      toast.error(e.message || "Impersonation failed");
      setImpersonating(null);
    }
  };

  const filtered = orgs.filter(o =>
    !search ||
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.companyCode.toLowerCase().includes(search.toLowerCase()) ||
    o.ein?.toLowerCase().includes(search.toLowerCase())
  );

  const statCards = [
    {
      label: "Total Organizations",
      value: stats?.totalOrgs ?? "—",
      icon: Building2,
      color: "text-primary",
      bg: "bg-primary/5",
    },
    {
      label: "Active",
      value: stats?.activeOrgs ?? "—",
      icon: Activity,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Suspended",
      value: stats?.suspendedOrgs ?? "—",
      icon: Ban,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Total Users",
      value: stats?.totalUsers ?? "—",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Platform Admin Console</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Manage all organizations, users, and subscriptions across MissionLedger.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["master-admin-orgs"] });
              qc.invalidateQueries({ queryKey: ["master-admin-stats"] });
            }}
          >
            <RefreshCcw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold text-foreground">{statsLoading ? "…" : value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Organizations Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">All Organizations</CardTitle>
                <CardDescription>Click any row to view details and manage users.</CardDescription>
              </div>
              <div className="relative w-60">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, code, EIN…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {orgsLoading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No organizations found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Organization</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(org => (
                    <TableRow
                      key={org.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedOrg(org)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {!org.isActive && <Lock className="w-3 h-3 text-red-500 shrink-0" />}
                          {org.closedUntil && <Lock className="w-3 h-3 text-amber-500 shrink-0" title="Period locked" />}
                          <span>{org.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{org.companyCode}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {org.organizationType.toLowerCase()}
                      </TableCell>
                      <TableCell>{statusBadge(org)}</TableCell>
                      <TableCell className="text-right text-sm">{org.userCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(org.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right pr-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleImpersonate(org)}
                            disabled={!org.isActive || impersonating === org.id}
                            title="View as this organization"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            {impersonating === org.id ? "…" : "View As"}
                          </Button>
                          <Button
                            size="sm"
                            variant={org.isActive ? "outline" : "default"}
                            className={`h-7 px-2 text-xs ${!org.isActive ? "bg-green-600 hover:bg-green-700 text-white border-0" : "text-red-600 border-red-200 hover:bg-red-50"}`}
                            onClick={() => {
                              setSuspendDialog(org);
                              setSuspendReason("");
                            }}
                          >
                            {org.isActive ? (
                              <><Ban className="w-3.5 h-3.5 mr-1" />Suspend</>
                            ) : (
                              <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Activate</>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Org Detail Modal */}
      <Dialog open={!!selectedOrg} onOpenChange={open => !open && setSelectedOrg(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {selectedOrg?.name}
            </DialogTitle>
            <DialogDescription>
              Code: {selectedOrg?.companyCode} · EIN: {selectedOrg?.ein || "—"} · {selectedOrg?.organizationType}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subscription</p>
              <div>{selectedOrg && statusBadge(selectedOrg)}</div>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period Status</p>
              <p>{selectedOrg?.closedUntil ? `Locked through ${format(new Date(selectedOrg.closedUntil), "MMM d, yyyy")}` : "Open"}</p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
              <p>{selectedOrg?.email || "—"}</p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</p>
              <p>{selectedOrg?.phone || "—"}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Users ({orgDetail?.users?.length ?? "…"})
            </h4>
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading users…</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(orgDetail?.users ?? []).map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="text-sm font-medium">{u.name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {u.isActive
                            ? <span className="text-xs text-green-600 font-medium">Active</span>
                            : <span className="text-xs text-red-600 font-medium">Inactive</span>
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => selectedOrg && handleImpersonate(selectedOrg)}
              disabled={!selectedOrg?.isActive || impersonating === selectedOrg?.id}
            >
              <Eye className="w-4 h-4 mr-2" />
              View As This Organization
            </Button>
            <Button variant="outline" onClick={() => setSelectedOrg(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend / Activate Confirmation Dialog */}
      <Dialog open={!!suspendDialog} onOpenChange={open => !open && setSuspendDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {suspendDialog?.isActive ? (
                <><Ban className="w-5 h-5 text-red-500" /> Suspend Organization</>
              ) : (
                <><CheckCircle2 className="w-5 h-5 text-green-600" /> Activate Organization</>
              )}
            </DialogTitle>
            <DialogDescription>
              {suspendDialog?.isActive
                ? `Suspending "${suspendDialog?.name}" will lock out all users. This action is reversible.`
                : `Activating "${suspendDialog?.name}" will restore full access for all users.`
              }
            </DialogDescription>
          </DialogHeader>

          {suspendDialog?.isActive && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                placeholder="Describe why this account is being suspended…"
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                rows={3}
              />
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  All active sessions for this organization will receive a 403 error on their next request.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={suspendDialog?.isActive ? "destructive" : "default"}
              className={!suspendDialog?.isActive ? "bg-green-600 hover:bg-green-700" : ""}
              disabled={suspendMutation.isPending}
              onClick={() => suspendDialog && suspendMutation.mutate({
                id: suspendDialog.id,
                isActive: !suspendDialog.isActive,
              })}
            >
              {suspendMutation.isPending ? "Processing…" : suspendDialog?.isActive ? "Suspend Organization" : "Activate Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
