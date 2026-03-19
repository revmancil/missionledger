import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { format } from "date-fns";
import {
  Building2, Users, AlertTriangle, CheckCircle2,
  Ban, Eye, RefreshCw, Search, ToggleLeft, ToggleRight,
  Wifi, WifiOff, CreditCard, ChevronDown, ChevronRight, X,
  TrendingUp, Activity, Lock, Wrench, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Request failed");
  }
  return res.json();
}

type OrgStatus = "ACTIVE" | "MAINTENANCE" | "SUSPENDED";

type OrgRow = {
  id: string;
  name: string;
  companyCode: string;
  organizationType: string;
  isActive: boolean;
  maintenanceMode: boolean;
  status: OrgStatus;
  subscriptionStatus: string;
  stripeCustomerId?: string;
  ein?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  userCount: number;
  dbHealth: { plaidActive: boolean; stripeActive: boolean };
  unreconciledAlert: boolean;
  lastReconciledAt?: string | null;
};

type Stats = {
  totalOrgs: number;
  activeOrgs: number;
  suspendedOrgs: number;
  totalUsers: number;
  paidSubscriptions: number;
  trialOrgs: number;
  globalAlerts: number;
  globalMaintenanceMode: boolean;
};

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status, subscriptionStatus }: { status: OrgStatus; subscriptionStatus: string }) {
  if (status === "SUSPENDED") return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-900/60 text-red-400 border border-red-800">
      <Ban className="h-3 w-3" /> Suspended
    </span>
  );
  if (status === "MAINTENANCE") return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-400 border border-amber-800">
      <Wrench className="h-3 w-3" /> Maintenance
    </span>
  );
  const subColors: Record<string, string> = {
    ACTIVE: "bg-emerald-900/60 text-emerald-400 border-emerald-800",
    TRIAL:  "bg-blue-900/60 text-blue-400 border-blue-800",
    CANCELLED: "bg-slate-800 text-slate-500 border-slate-700",
    INACTIVE: "bg-amber-900/60 text-amber-400 border-amber-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border", subColors[subscriptionStatus] ?? subColors.INACTIVE)}>
      <Activity className="h-3 w-3" /> {subscriptionStatus}
    </span>
  );
}

// ── DB Health dots ─────────────────────────────────────────────────────────────
function DbHealthIndicator({ plaidActive, stripeActive }: { plaidActive: boolean; stripeActive: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span title={plaidActive ? "Plaid linked" : "No Plaid link"} className="flex items-center gap-1 text-[11px] font-mono">
        {plaidActive ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-slate-600" />}
      </span>
      <span title={stripeActive ? "Stripe active" : "No active Stripe subscription"} className="flex items-center gap-1">
        <CreditCard className={cn("h-3.5 w-3.5", stripeActive ? "text-emerald-500" : "text-slate-600")} />
      </span>
    </div>
  );
}

// ── Status Selector ────────────────────────────────────────────────────────────
function StatusSelector({ org, onUpdate }: { org: OrgRow; onUpdate: () => void }) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);

  async function setStatus(newStatus: OrgStatus) {
    setOpen(false);
    setSaving(true);
    try {
      const body: any = {};
      if (newStatus === "SUSPENDED") { body.isActive = false; body.maintenanceMode = false; }
      else if (newStatus === "MAINTENANCE") { body.isActive = true; body.maintenanceMode = true; }
      else { body.isActive = true; body.maintenanceMode = false; }
      await apiFetch(`/api/master-admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onUpdate();
    } finally { setSaving(false); }
  }

  const options: { value: OrgStatus; label: string; icon: any; color: string }[] = [
    { value: "ACTIVE",      label: "Active",      icon: CheckCircle2, color: "text-emerald-400" },
    { value: "MAINTENANCE", label: "Maintenance",  icon: Wrench,       color: "text-amber-400" },
    { value: "SUSPENDED",   label: "Suspended",    icon: Ban,          color: "text-red-400" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        disabled={saving}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
      >
        {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3" />}
        Status
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            {options.map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                disabled={org.status === value}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors",
                  org.status === value && "bg-slate-700 font-bold"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", color)} />
                {label}
                {org.status === value && <ChevronRight className="h-3 w-3 ml-auto text-slate-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Org Detail Drawer ──────────────────────────────────────────────────────────
function OrgDetailDrawer({ org, onClose, onRefresh }: { org: OrgRow; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    apiFetch(`/api/master-admin/organizations/${org.id}`).then(setDetail).catch(() => {});
  }, [org.id]);

  async function handleImpersonate() {
    setImpersonating(true);
    try {
      await apiFetch(`/api/master-admin/impersonate/${org.id}`, { method: "POST" });
      window.location.href = `${BASE}/dashboard`;
    } catch (e: any) {
      alert(e.message || "Impersonation failed");
      setImpersonating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[480px] bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <div className="font-bold text-white">{org.name}</div>
            <div className="text-xs font-mono text-slate-500 mt-0.5">{org.companyCode} · {org.organizationType}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status + actions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Status</p>
              <StatusBadge status={org.status} subscriptionStatus={org.subscriptionStatus} />
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Subscription</p>
              <p className="text-sm text-slate-200 font-semibold">{org.subscriptionStatus}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">DB Health</p>
              <DbHealthIndicator plaidActive={org.dbHealth.plaidActive} stripeActive={org.dbHealth.stripeActive} />
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Users</p>
              <p className="text-sm text-slate-200 font-semibold">{org.userCount}</p>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm">
            {org.email && <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-300">{org.email}</span></div>}
            {org.ein && <div className="flex justify-between"><span className="text-slate-500">EIN</span><span className="text-slate-300 font-mono">{org.ein}</span></div>}
            {org.lastReconciledAt && (
              <div className="flex justify-between">
                <span className="text-slate-500">Last Reconciled</span>
                <span className={cn("text-slate-300", org.unreconciledAlert && "text-amber-400")}>
                  {format(new Date(org.lastReconciledAt), "MMM d, yyyy")}
                  {org.unreconciledAlert && " ⚠"}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Joined</span>
              <span className="text-slate-300">{format(new Date(org.createdAt), "MMM d, yyyy")}</span>
            </div>
          </div>

          {/* Users */}
          <div>
            <h4 className="text-[11px] text-slate-500 uppercase tracking-wide mb-3">Team Members</h4>
            {!detail ? (
              <div className="text-sm text-slate-600 flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
                {(detail.users ?? []).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm text-slate-200 font-medium">{u.name || u.email}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{u.role}</span>
                      <span className={cn("w-1.5 h-1.5 rounded-full", u.isActive ? "bg-emerald-500" : "bg-slate-600")} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={handleImpersonate}
            disabled={!org.isActive || impersonating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {impersonating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {impersonating ? "Switching…" : "Log in as Tenant"}
          </button>
          <StatusSelector org={org} onUpdate={() => { onRefresh(); onClose(); }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminCommandCenter() {
  const [, setLocation] = useLocation();
  const [authChecked, setAuthChecked]       = useState(false);
  const [stats, setStats]                   = useState<Stats | null>(null);
  const [orgs, setOrgs]                     = useState<OrgRow[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [statusFilter, setStatusFilter]     = useState<"ALL" | OrgStatus>("ALL");
  const [selectedOrg, setSelectedOrg]       = useState<OrgRow | null>(null);
  const [togglingMaint, setTogglingMaint]   = useState(false);
  const [impersonating, setImpersonating]   = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    fetch(`${BASE}/api/auth/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (!user?.isPlatformAdmin) { setLocation("/admin/login"); return; }
        setAuthChecked(true);
      })
      .catch(() => setLocation("/admin/login"));
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        apiFetch("/api/master-admin/stats"),
        apiFetch("/api/master-admin/organizations"),
      ]);
      setStats(s);
      setOrgs(o);
    } catch (e: any) {
      console.error("Failed to load admin data:", e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (authChecked) loadData(); }, [authChecked]);

  async function toggleGlobalMaintenance() {
    if (!stats) return;
    const newVal = !stats.globalMaintenanceMode;
    if (!newVal || confirm(`Enable Global Maintenance Mode? This will show a 'Back Soon' notice to ALL tenant users.`)) {
      setTogglingMaint(true);
      try {
        await apiFetch("/api/master-admin/system/maintenance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: newVal }),
        });
        await loadData();
      } finally { setTogglingMaint(false); }
    }
  }

  async function handleImpersonate(org: OrgRow) {
    setImpersonating(org.id);
    try {
      await apiFetch(`/api/master-admin/impersonate/${org.id}`, { method: "POST" });
      window.location.href = `${BASE}/dashboard`;
    } catch (e: any) {
      alert(e.message || "Impersonation failed");
      setImpersonating(null);
    }
  }

  const filtered = useMemo(() => {
    return orgs.filter(o => {
      const matchSearch = !search ||
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.companyCode.toLowerCase().includes(search.toLowerCase()) ||
        (o.ein ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orgs, search, statusFilter]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const kpiCards = [
    { label: "Total Tenants", value: stats?.totalOrgs ?? "—", icon: Building2, color: "text-white", bg: "bg-slate-800", border: "border-slate-700" },
    { label: "Active Orgs", value: stats?.activeOrgs ?? "—", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-800/50" },
    { label: "Paid Subscriptions", value: stats?.paidSubscriptions ?? "—", icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-800/50" },
    { label: "Global Alerts", value: stats?.globalAlerts ?? "—", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/50",
      subtitle: stats?.globalAlerts ? "Unreconciled 30+ days" : undefined },
    { label: "Suspended", value: stats?.suspendedOrgs ?? "—", icon: Ban, color: "text-red-400", bg: "bg-red-950/40", border: "border-red-800/50" },
    { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-violet-400", bg: "bg-violet-950/40", border: "border-violet-800/50" },
  ];

  return (
    <AdminLayout title="Command Center">
      <div className="space-y-6 max-w-7xl">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, color, bg, border, subtitle }) => (
            <div key={label} className={cn("rounded-xl border p-4", bg, border)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-4 w-4 shrink-0", color)} />
                <p className="text-[10px] text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
              </div>
              <p className={cn("text-2xl font-bold tabular-nums", color)}>
                {loading ? "…" : value}
              </p>
              {subtitle && <p className="text-[10px] text-amber-500 mt-1">{subtitle}</p>}
            </div>
          ))}
        </div>

        {/* Global Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Maintenance Mode */}
          <div className={cn(
            "rounded-xl border p-5 flex items-start justify-between gap-4 transition-colors",
            stats?.globalMaintenanceMode ? "bg-amber-950/40 border-amber-700" : "bg-slate-900 border-slate-800"
          )}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe className={cn("h-4 w-4", stats?.globalMaintenanceMode ? "text-amber-400" : "text-slate-500")} />
                <p className="text-sm font-bold text-slate-200">Global Maintenance Mode</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {stats?.globalMaintenanceMode
                  ? "ALL tenant apps are showing a 'Back Soon' screen. Toggle off to restore access."
                  : "Toggle ON to put all tenant apps in maintenance mode simultaneously."}
              </p>
            </div>
            <button
              onClick={toggleGlobalMaintenance}
              disabled={togglingMaint || loading}
              className="shrink-0 mt-0.5 disabled:opacity-50 transition-colors"
              title={stats?.globalMaintenanceMode ? "Disable maintenance mode" : "Enable maintenance mode"}
            >
              {togglingMaint ? (
                <RefreshCw className="h-8 w-8 animate-spin text-slate-500" />
              ) : stats?.globalMaintenanceMode ? (
                <ToggleRight className="h-8 w-8 text-amber-400" />
              ) : (
                <ToggleLeft className="h-8 w-8 text-slate-600" />
              )}
            </button>
          </div>

          {/* Quick stats */}
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-3">Platform Breakdown</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Trial Orgs", value: stats?.trialOrgs ?? "—", color: "text-blue-400" },
                { label: "Paid Orgs", value: stats?.paidSubscriptions ?? "—", color: "text-emerald-400" },
                { label: "Alerts", value: stats?.globalAlerts ?? "—", color: stats?.globalAlerts ? "text-amber-400" : "text-slate-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={cn("text-xl font-bold tabular-nums", color)}>{loading ? "…" : value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tenant Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-slate-200">All Organizations</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Status filter */}
              <div className="flex items-center gap-1 text-xs">
                {(["ALL", "ACTIVE", "MAINTENANCE", "SUSPENDED"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-medium transition-colors",
                      statusFilter === s ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, code, EIN…"
                  className="h-8 pl-8 pr-3 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600 w-52"
                />
              </div>
              {/* Refresh */}
              <button onClick={loadData} disabled={loading} className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-semibold">Organization</th>
                  <th className="text-left px-3 py-3 font-semibold">Code</th>
                  <th className="text-left px-3 py-3 font-semibold">Status</th>
                  <th className="text-center px-3 py-3 font-semibold">DB Health</th>
                  <th className="text-right px-3 py-3 font-semibold">Users</th>
                  <th className="text-left px-3 py-3 font-semibold">Joined</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-600">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-600">No organizations found</td></tr>
                ) : filtered.map(org => (
                  <tr
                    key={org.id}
                    className={cn(
                      "hover:bg-slate-800/50 transition-colors cursor-pointer",
                      org.status === "SUSPENDED" && "opacity-60"
                    )}
                    onClick={() => setSelectedOrg(org)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {org.unreconciledAlert && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Unreconciled 30+ days" />
                        )}
                        {org.status === "MAINTENANCE" && (
                          <Wrench className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Maintenance mode" />
                        )}
                        {org.status === "SUSPENDED" && (
                          <Lock className="h-3.5 w-3.5 text-red-500 shrink-0" title="Suspended" />
                        )}
                        <span className="font-medium text-slate-200">{org.name}</span>
                      </div>
                      {org.email && <div className="text-[11px] text-slate-500 mt-0.5">{org.email}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <code className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">{org.companyCode}</code>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={org.status} subscriptionStatus={org.subscriptionStatus} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <DbHealthIndicator plaidActive={org.dbHealth.plaidActive} stripeActive={org.dbHealth.stripeActive} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-400 tabular-nums">{org.userCount}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs tabular-nums">{format(new Date(org.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); handleImpersonate(org); }}
                          disabled={!org.isActive || !!impersonating}
                          title="Log in as this tenant"
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-900/50 hover:bg-blue-800/70 border border-blue-800 text-blue-400 text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {impersonating === org.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View As
                        </button>
                        <StatusSelector org={org} onUpdate={loadData} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {!loading && (
            <div className="px-5 py-3 border-t border-slate-800 text-[11px] text-slate-600">
              Showing {filtered.length} of {orgs.length} organizations
            </div>
          )}
        </div>
      </div>

      {/* Org Detail Drawer */}
      {selectedOrg && (
        <OrgDetailDrawer
          org={selectedOrg}
          onClose={() => setSelectedOrg(null)}
          onRefresh={loadData}
        />
      )}
    </AdminLayout>
  );
}
