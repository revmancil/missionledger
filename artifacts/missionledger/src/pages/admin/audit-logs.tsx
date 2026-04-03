import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { format } from "date-fns";
import {
  Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as ChevronRightIcon, AlertCircle,
  LogIn, PlusCircle, Pencil, Trash2, Ban, FileText, Clock, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string) {
  const token = localStorage.getItem("ml_token");
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

type AuditLog = {
  id: string;
  companyId: string;
  companyName: string | null;
  companyCode: string | null;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
};

const ACTION_COLORS: Record<string, string> = {
  CREATE:       "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  UPDATE:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DELETE:       "bg-red-500/10 text-red-400 border-red-500/20",
  VOID:         "bg-orange-500/10 text-orange-400 border-orange-500/20",
  LOGIN:        "bg-violet-500/10 text-violet-400 border-violet-500/20",
  LOGOUT:       "bg-slate-500/10 text-slate-400 border-slate-500/20",
  PERIOD_CLOSE: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  PERIOD_REOPEN:"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  RESTORE:      "bg-teal-500/10 text-teal-400 border-teal-500/20",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE:       PlusCircle,
  UPDATE:       Pencil,
  DELETE:       Trash2,
  VOID:         Ban,
  LOGIN:        LogIn,
  LOGOUT:       LogIn,
  PERIOD_CLOSE: Clock,
  PERIOD_REOPEN:Clock,
};

const ENTITY_LABELS: Record<string, string> = {
  TRANSACTION:   "Transaction",
  JOURNAL_ENTRY: "Journal Entry",
  ACCOUNT:       "Account",
  FUND:          "Fund",
  USER:          "User",
  SESSION:       "Session",
  PERIOD:        "Period",
  OPENING_BALANCE:"Opening Balance",
};

const PAGE_SIZE = 50;

function ActionBadge({ action }: { action: string }) {
  const classes = ACTION_COLORS[action] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  const Icon = ACTION_ICONS[action] ?? AlertCircle;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold uppercase tracking-wide", classes)}>
      <Icon className="h-3 w-3" />
      {action.replace("_", " ")}
    </span>
  );
}

function JsonView({ raw, label }: { raw: string | null; label: string }) {
  if (!raw) return <span className="text-slate-600 text-xs italic">—</span>;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
      <pre className="text-[11px] text-slate-300 bg-slate-900 rounded p-2 overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = !!(log.oldValue || log.newValue);
  const hasExtra = hasDiff || log.ipAddress || log.entityId;

  return (
    <>
      <tr
        className={cn(
          "border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors",
          expanded && "bg-slate-800/40"
        )}
      >
        {/* Expand toggle */}
        <td className="px-3 py-3 w-8">
          {hasExtra && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
            </button>
          )}
        </td>
        {/* Timestamp */}
        <td className="px-3 py-3 text-xs text-slate-400 font-mono whitespace-nowrap">
          {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
        </td>
        {/* Org */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3 text-slate-500 shrink-0" />
            <div>
              <div className="text-xs text-slate-200 font-medium leading-tight">{log.companyName ?? log.companyId.slice(0, 8)}</div>
              {log.companyCode && <div className="text-[10px] text-slate-500 font-mono">{log.companyCode}</div>}
            </div>
          </div>
        </td>
        {/* User */}
        <td className="px-3 py-3">
          <div className="text-xs text-slate-200">{log.userName ?? "—"}</div>
          <div className="text-[10px] text-slate-500">{log.userEmail ?? log.userId.slice(0, 8)}</div>
        </td>
        {/* Action */}
        <td className="px-3 py-3">
          <ActionBadge action={log.action} />
        </td>
        {/* Entity type */}
        <td className="px-3 py-3">
          {log.entityType && (
            <span className="text-xs text-slate-400 font-mono">
              {ENTITY_LABELS[log.entityType] ?? log.entityType}
            </span>
          )}
        </td>
        {/* Description */}
        <td className="px-3 py-3 max-w-sm">
          <p className="text-xs text-slate-300 truncate" title={log.description}>{log.description}</p>
        </td>
      </tr>
      {expanded && hasExtra && (
        <tr className="bg-slate-900/60 border-b border-slate-800/50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {log.oldValue && <JsonView raw={log.oldValue} label="Before" />}
              {log.newValue && <JsonView raw={log.newValue} label="After" />}
            </div>
            {(log.entityId || log.ipAddress) && (
              <div className="flex gap-6 mt-3 text-[11px] font-mono text-slate-500">
                {log.entityId && <span>Entity ID: <span className="text-slate-400">{log.entityId}</span></span>}
                {log.ipAddress && <span>IP: <span className="text-slate-400">{log.ipAddress}</span></span>}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set("action", filterAction);
      if (filterEntityType) params.set("entityType", filterEntityType);
      if (filterSearch) params.set("search", filterSearch);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const data = await apiFetch(`/api/master-admin/audit-logs?${params.toString()}`);
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEntityType, filterSearch, filterStartDate, filterEndDate, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function applySearch() {
    setFilterSearch(searchInput);
    setPage(0);
  }

  function clearFilters() {
    setFilterAction("");
    setFilterEntityType("");
    setFilterSearch("");
    setSearchInput("");
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(filterAction || filterEntityType || filterSearch || filterStartDate || filterEndDate);

  return (
    <AdminLayout title="Immutable Audit Log">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Immutable Audit Log</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Tamper-evident record of all system events — logins, mutations, and period closings.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px] flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && applySearch()}
                  placeholder="Search description, email, entity ID…"
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                onClick={applySearch}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium transition-all"
              >
                Search
              </button>
            </div>

            {/* Action filter */}
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
            >
              <option value="">All Actions</option>
              {["CREATE", "UPDATE", "DELETE", "VOID", "LOGIN", "LOGOUT", "PERIOD_CLOSE", "PERIOD_REOPEN"].map(a => (
                <option key={a} value={a}>{a.replace("_", " ")}</option>
              ))}
            </select>

            {/* Entity type filter */}
            <select
              value={filterEntityType}
              onChange={e => { setFilterEntityType(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
            >
              <option value="">All Entity Types</option>
              {["TRANSACTION", "JOURNAL_ENTRY", "ACCOUNT", "FUND", "USER", "SESSION", "PERIOD"].map(t => (
                <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>
              ))}
            </select>

            {/* Date range */}
            <input
              type="date"
              value={filterStartDate}
              onChange={e => { setFilterStartDate(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
            />
            <input
              type="date"
              value={filterEndDate}
              onChange={e => { setFilterEndDate(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-red-500"
            />

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest self-center">Filters:</span>
              {filterAction && <span className="px-2 py-0.5 text-xs bg-red-900/30 text-red-300 rounded border border-red-800/40">{filterAction}</span>}
              {filterEntityType && <span className="px-2 py-0.5 text-xs bg-blue-900/30 text-blue-300 rounded border border-blue-800/40">{ENTITY_LABELS[filterEntityType] ?? filterEntityType}</span>}
              {filterSearch && <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded border border-slate-600/40">"{filterSearch}"</span>}
              {filterStartDate && <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded border border-slate-600/40">From {filterStartDate}</span>}
              {filterEndDate && <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-300 rounded border border-slate-600/40">To {filterEndDate}</span>}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="text-xs text-slate-500">
          {loading ? "Loading…" : `${total.toLocaleString()} events total${hasFilters ? " (filtered)" : ""} — showing ${(page * PAGE_SIZE) + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50">
                  <th className="px-3 py-2.5 w-8" />
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">Timestamp</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Organization</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">User</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Action</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Entity</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Description</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-4 bg-slate-800 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <FileText className="h-8 w-8 text-slate-600 mx-auto mb-3" />
                      <div className="text-slate-500 text-sm">No audit events found</div>
                      {hasFilters && <div className="text-slate-600 text-xs mt-1">Try adjusting your filters</div>}
                    </td>
                  </tr>
                ) : (
                  logs.map(log => <LogRow key={log.id} log={log} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/30">
              <div className="text-xs text-slate-500">
                Page {page + 1} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let pg = i;
                  if (totalPages > 5) {
                    const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                    pg = start + i;
                  }
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={cn(
                        "w-7 h-7 rounded-lg text-xs font-medium transition-all",
                        pg === page
                          ? "bg-red-600 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      )}
                    >
                      {pg + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-[11px] text-slate-600 text-center">
          Audit entries are append-only and cannot be modified or deleted. All timestamps are UTC.
        </p>
      </div>
    </AdminLayout>
  );
}
