import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";

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

export default function AdminUsersPage() {
  const [companyInfo, setCompanyInfo] = useState<{ companyId: string; companyCode: string; companyName: string; isPrimaryAdmin?: boolean } | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", userId: "", email: "", password: "", role: "USER" as UiRole });

  async function load() {
    setLoading(true);
    try {
      const [meRes, usersRes] = await Promise.all([
        authJsonFetch("api/users/me"),
        authJsonFetch("api/users"),
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
    } catch (err: any) {
      toast.error(err.message || "Failed to load user admin data");
    } finally {
      setLoading(false);
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
        headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to update user");
  }

  async function deleteUser(id: string) {
    const res = await authJsonFetch(`api/users/${id}`, { method: "DELETE" });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to delete user");
  }

  async function makePrimary(id: string) {
    const res = await authJsonFetch(`api/users/${id}/make-primary`, { method: "POST" });
    const data = await readJsonSafe<any>(res);
    if (!res.ok) throw new Error(data?.error ?? "Failed to set new Primary Admin");
  }

  return (
    <AppLayout title="Admin Users">
      <div className="space-y-6 max-w-5xl">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">Company Information</h2>
          {companyInfo ? (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Company Name:</span> {companyInfo.companyName}</div>
              <div><span className="text-muted-foreground">Company Code:</span> {companyInfo.companyCode}</div>
              <div><span className="text-muted-foreground">Company ID:</span> <code>{companyInfo.companyId}</code></div>
            </div>
          ) : <p className="text-sm text-muted-foreground">Loading...</p>}
        </div>

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
