import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { BookOpen, Plus, Trash2, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

type CoaEntry = { code: string; name: string; type: string; parent_code?: string; sort_order: number };

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const TYPE_COLORS: Record<string, string> = {
  ASSET:     "bg-blue-900/40 text-blue-400 border-blue-800",
  LIABILITY: "bg-orange-900/40 text-orange-400 border-orange-800",
  EQUITY:    "bg-violet-900/40 text-violet-400 border-violet-800",
  INCOME:    "bg-emerald-900/40 text-emerald-400 border-emerald-800",
  EXPENSE:   "bg-red-900/40 text-red-400 border-red-800",
};

export default function AdminGlobalCoaPage() {
  const [, setLocation] = useLocation();
  const [entries, setEntries] = useState<CoaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET" as string, parentCode: "" });
  const [formError, setFormError] = useState("");

  // Auth guard
  useEffect(() => {
    const storedToken = localStorage.getItem("ml_token");
    fetch(`${BASE}/api/auth/me`, {
      credentials: "include",
      headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : undefined,
    })
      .then(r => r.ok ? r.json() : null)
      .then(user => { if (!user?.isPlatformAdmin) setLocation("/admin/login"); })
      .catch(() => setLocation("/admin/login"));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/master-admin/global-coa");
      setEntries(data);
    } catch { } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.code.trim() || !form.name.trim()) { setFormError("Code and Name are required."); return; }
    setSaving("new");
    try {
      await apiFetch("/api/master-admin/global-coa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.code.trim(), name: form.name.trim(), type: form.type, parentCode: form.parentCode.trim() || undefined }),
      });
      setForm({ code: "", name: "", type: "ASSET", parentCode: "" });
      setShowAdd(false);
      await load();
    } catch (err: any) { setFormError(err.message); } finally { setSaving(null); }
  }

  async function handleDelete(code: string) {
    if (!confirm(`Remove "${code}" from the default COA template? This only affects new signups.`)) return;
    setDeleting(code);
    try {
      await apiFetch(`/api/master-admin/global-coa/${encodeURIComponent(code)}`, { method: "DELETE" });
      await load();
    } catch { } finally { setDeleting(null); }
  }

  const grouped = TYPES.reduce((acc, t) => {
    acc[t] = entries.filter(e => e.type === t).sort((a, b) => a.sort_order - b.sort_order);
    return acc;
  }, {} as Record<string, CoaEntry[]>);

  return (
    <AdminLayout title="Global COA Template">
      <div className="max-w-4xl space-y-6">

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-800/50 bg-blue-950/30 text-sm text-blue-300">
          <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
          <div>
            <strong>Global Chart of Accounts Template</strong> — These accounts are automatically copied to every new organization on signup.
            Changes here do <em>not</em> affect existing organizations. Add, remove, or rename entries as needed for new nonprofits.
          </div>
        </div>

        {/* Add entry */}
        <div>
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Account to Template
            </button>
          ) : (
            <form onSubmit={handleSaveEntry} className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Plus className="h-4 w-4 text-slate-400" /> New Template Entry</h3>
              {formError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/50 border border-red-800 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {formError}
                </div>
              )}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Code *</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. 4500"
                    className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-600"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Account Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Event Revenue"
                    className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full h-9 px-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
                  >
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="w-48">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Parent Code (optional)</label>
                <input
                  value={form.parentCode}
                  onChange={e => setForm(p => ({ ...p, parentCode: e.target.value }))}
                  placeholder="e.g. 4000"
                  className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-600"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving === "new"}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {saving === "new" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Entry
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setFormError(""); }} className="text-sm text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* COA grouped by type */}
        {loading ? (
          <div className="text-center py-16 text-slate-600 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading template…
          </div>
        ) : (
          <div className="space-y-4">
            {TYPES.map(type => {
              const typeEntries = grouped[type] ?? [];
              if (typeEntries.length === 0) return null;
              return (
                <div key={type} className="rounded-xl border border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", TYPE_COLORS[type] ?? "bg-slate-800 text-slate-400 border-slate-700")}>
                      {type}
                    </span>
                    <span className="text-[11px] text-slate-500">{typeEntries.length} accounts</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-slate-600 uppercase tracking-wide border-b border-slate-800">
                        <th className="text-left px-5 py-2 font-semibold">Code</th>
                        <th className="text-left px-3 py-2 font-semibold">Account Name</th>
                        <th className="text-left px-3 py-2 font-semibold">Parent</th>
                        <th className="text-right px-5 py-2 font-semibold" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {typeEntries.map(entry => (
                        <tr key={entry.code} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-2.5">
                            <code className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{entry.code}</code>
                          </td>
                          <td className="px-3 py-2.5 text-slate-200">{entry.name}</td>
                          <td className="px-3 py-2.5">
                            {entry.parent_code
                              ? <code className="text-xs font-mono text-slate-500">{entry.parent_code}</code>
                              : <span className="text-slate-700">—</span>
                            }
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <button
                              onClick={() => handleDelete(entry.code)}
                              disabled={deleting === entry.code}
                              className="text-slate-600 hover:text-red-500 disabled:opacity-50 transition-colors"
                              title="Remove from template"
                            >
                              {deleting === entry.code
                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
