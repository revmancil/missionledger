import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";
import { apiUrl } from "@/lib/api-base";

type UiRole = "PRIMARY_ADMIN" | "ADMIN" | "USER" | "BOARD";

type ManagedUser = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  uiRole: UiRole;
  isPrimaryAdmin: boolean;
  isActive: boolean;
};

const ROLE_OPTIONS: UiRole[] = ["PRIMARY_ADMIN", "ADMIN", "USER", "BOARD"];

type CompanyFormState = {
  name: string;
  dba: string | null;
  ein: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  companyCode: string;
  donationsEnabled: boolean;
  zeffyFormUrl: string;
};

export default function AdminUsersPage() {
  const [companyInfo, setCompanyInfo] = useState<{ companyId: string; companyCode: string; companyName: string; isPrimaryAdmin?: boolean } | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyFormState | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [form, setForm] = useState({ name: "", userId: "", email: "", password: "", role: "USER" as UiRole });

  async function load() {
    setLoading(true);
    try {
      const [meRes, usersRes, companyRes] = await Promise.all([
        authJsonFetch("api/users/me"),
        authJsonFetch("api/users"),
        authJsonFetch("api/companies"),
      ]);
      const me = await readJsonSafe<any>(meRes);
      if (!meRes.ok) throw new Error(me?.error ?? "Failed to load company profile");
      const list = await readJsonSafe<any>(usersRes);
      if (!usersRes.ok) throw new Error(list?.error ?? "Failed to load users");
      setCompanyInfo({
        companyId: me?.companyId ?? "",
        companyCode: me?.companyCode ?? "",
        companyName: me?.companyName ?? "",
        isPrimaryAdmin: !!me?.isPrimaryAdmin,
      });
      setUsers(Array.isArray(list) ? list : []);

      if (companyRes.ok) {
        const c = await readJsonSafe<any>(companyRes);
        setCompanyForm({
          name: c?.name ?? "",
          dba: c?.dba ?? null,
          ein: c?.ein ?? "",
          address: c?.address ?? null,
          phone: c?.phone ?? null,
          email: c?.email ?? null,
          companyCode: c?.companyCode ?? "",
          donationsEnabled: !!c?.donationsEnabled,
          zeffyFormUrl: c?.zeffyFormUrl ?? "",
        });
      } else {
        setCompanyForm(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load user admin data");
    } finally {
      setLoading(false);
    }
  }

  async function saveCompanySettings() {
    if (!companyForm) return;
    setCompanySaving(true);
    try {
      const res = await authJsonFetch("api/companies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyForm.name,
          dba: companyForm.dba,
          ein: companyForm.ein,
          address: companyForm.address,
          phone: companyForm.phone,
          email: companyForm.email,
          donationsEnabled: companyForm.donationsEnabled,
          zeffyFormUrl: companyForm.zeffyFormUrl.trim() || null,
        }),
      });
      const data = await readJsonSafe<any>(res);
      if (!res.ok) throw new Error(data?.error ?? "Failed to save company settings");
      toast.success("Donation settings saved.");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save company settings");
    } finally {
      setCompanySaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createUser() {
    if (!form.userId || !form.password) {
      toast.error("User ID and password are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await authJsonFetch("api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(companyInfo?.companyId ? { "x-company-id-expected": companyInfo.companyId } : {}),
        },
        body: JSON.stringify(form),
      });
      const data = await readJsonSafe<any>(res);
      if (!res.ok) throw new Error(data?.error ?? "Failed to create user");
      toast.success("User created.");
      setForm({ name: "", userId: "", email: "", password: "", role: "USER" });
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function updateUserRole(id: string, role: UiRole) {
    const res = await authJsonFetch(`api/users/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(companyInfo?.companyId ? { "x-company-id-expected": companyInfo.companyId } : {}),
      },
      body: JSON.stringify({ role }),
    });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to update user");
  }

  async function deleteUser(id: string) {
    const res = await authJsonFetch(`api/users/${id}`, {
      method: "DELETE",
      headers: {
        ...(companyInfo?.companyId ? { "x-company-id-expected": companyInfo.companyId } : {}),
      },
    });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to delete user");
  }

  async function makePrimary(id: string) {
    const res = await authJsonFetch(`api/users/${id}/make-primary`, {
      method: "POST",
      headers: {
        ...(companyInfo?.companyId ? { "x-company-id-expected": companyInfo.companyId } : {}),
      },
    });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to set new Primary Admin");
  }

  return (
    <AppLayout title="Admin Users">
      <div className="space-y-6 max-w-5xl">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-lg font-semibold">Company Information</h2>
            <Button asChild variant="outline" size="sm" className="shrink-0 w-fit">
              <Link href="/donor-giving">Donor Giving</Link>
            </Button>
          </div>
          {companyInfo ? (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Company Name:</span> {companyInfo.companyName}</div>
              <div><span className="text-muted-foreground">Company Code:</span> {companyInfo.companyCode}</div>
              <div><span className="text-muted-foreground">Company ID:</span> <code>{companyInfo.companyId}</code></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Loading...</p>}
        </div>

        {companyForm && (
          <div className="border rounded-xl p-5 space-y-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">Online Donations</h3>
                <p className="text-sm text-muted-foreground">Accept donations online through Zeffy (free for nonprofits)</p>
              </div>
              <Switch
                checked={companyForm.donationsEnabled ?? false}
                onCheckedChange={(val) => {
                  setCompanyForm((f) => {
                    if (!f) return f;
                    if (val && !f.zeffyFormUrl) {
                      window.open("https://zeffy.com", "_blank");
                    }
                    return { ...f, donationsEnabled: val };
                  });
                }}
              />
            </div>

            {companyForm.donationsEnabled && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <label className="text-sm font-medium">Zeffy Form URL</label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Paste your Zeffy donation form URL here.{" "}
                    <a
                      href="https://zeffy.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-primary"
                    >
                      Create one at zeffy.com →
                    </a>
                  </p>
                  <Input
                    placeholder="https://www.zeffy.com/donation-form/your-form-id"
                    value={companyForm.zeffyFormUrl ?? ""}
                    onChange={(e) => setCompanyForm((f) => (f ? { ...f, zeffyFormUrl: e.target.value } : f))}
                  />
                </div>

                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium">Your public giving page:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white border rounded px-2 py-1 flex-1 truncate">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/give?org=${companyForm.companyCode}`
                        : ""}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/give?org=${companyForm.companyCode}`,
                        )
                      }
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      type="button"
                      onClick={() =>
                        window.open(
                          `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/give?org=${encodeURIComponent(companyForm.companyCode)}`,
                          "_blank",
                        )
                      }
                    >
                      Preview
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Zeffy webhook URL (add in Zeffy → Settings → Integrations):
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white border rounded px-2 py-1 flex-1 truncate">
                      {`${apiUrl("/api/zeffy/webhook")}?org=${encodeURIComponent(companyForm.companyCode)}`}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `${apiUrl("/api/zeffy/webhook")}?org=${encodeURIComponent(companyForm.companyCode)}`,
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>

              </div>
            )}

            <Button type="button" onClick={saveCompanySettings} disabled={companySaving} className="mt-2">
              {companySaving ? "Saving…" : "Save donation settings"}
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-semibold">Add User</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="User ID (login)" value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))} />
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Temporary Password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UiRole }))}>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
            </select>
          </div>
          <Button onClick={createUser} disabled={saving}>{saving ? "Saving..." : "Create User"}</Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">Users</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="border border-border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <div className="flex-1">
                    <div className="font-medium">{u.name || u.email}</div>
                    <div className="text-xs text-muted-foreground">User ID: {u.userId}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="text-xs md:w-36">{u.isPrimaryAdmin ? "PRIMARY ADMIN" : u.uiRole}</div>
                  <div className="flex gap-2">
                    <select
                      className="h-8 rounded border border-input bg-background px-2 text-xs"
                      value={u.isPrimaryAdmin ? "PRIMARY_ADMIN" : u.uiRole}
                      onChange={async (e) => {
                        try {
                          const nextRole = e.target.value as UiRole;
                          await updateUserRole(u.id, nextRole);
                          toast.success("User updated.");
                          await load();
                        } catch (err: any) {
                          toast.error(err.message || "Failed to update user");
                        }
                      }}
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await makePrimary(u.id);
                          toast.success("Primary Admin updated.");
                          await load();
                        } catch (err: any) {
                          toast.error(err.message || "Failed to assign Primary Admin");
                        }
                      }}
                    >
                      Make Primary
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (!confirm(`Delete ${u.email}?`)) return;
                        try {
                          await deleteUser(u.id);
                          toast.success("User deleted.");
                          await load();
                        } catch (err: any) {
                          toast.error(err.message || "Failed to delete user");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
