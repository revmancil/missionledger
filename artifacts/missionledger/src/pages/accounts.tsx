import { useMemo, useState, Fragment, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useChartOfAccounts,
  useCreateChartAccount,
  useUpdateChartAccount,
  useDeleteChartAccount,
  type ChartCoaAccount,
} from "@/hooks/use-chart-of-accounts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, BookOpen, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const COA_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income (Revenue)",
  EXPENSE: "Expenses",
};

function sortCoa(a: ChartCoaAccount, b: ChartCoaAccount): number {
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

function childrenByParentId(accounts: ChartCoaAccount[]): Map<string | null, ChartCoaAccount[]> {
  const map = new Map<string | null, ChartCoaAccount[]>();
  for (const a of accounts) {
    const p = a.parentId ?? null;
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(a);
  }
  for (const list of map.values()) list.sort(sortCoa);
  return map;
}

function collectDescendantIds(rootId: string, byParent: Map<string | null, ChartCoaAccount[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const a = stack.pop()!;
    if (out.has(a.id)) continue;
    out.add(a.id);
    for (const c of byParent.get(a.id) ?? []) stack.push(c);
  }
  return out;
}

function rootsForType(
  typeAccounts: ChartCoaAccount[],
  byParent: Map<string | null, ChartCoaAccount[]>,
): ChartCoaAccount[] {
  const ids = new Set(typeAccounts.map((a) => a.id));
  return typeAccounts
    .filter((a) => {
      if (!a.parentId) return true;
      return !ids.has(a.parentId);
    })
    .sort(sortCoa);
}

function ParentAccountSelect({
  value,
  onChange,
  accounts,
  excludeIds,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  accounts: ChartCoaAccount[];
  excludeIds: Set<string>;
  id?: string;
}) {
  const options = accounts.filter((a) => !excludeIds.has(a.id));
  return (
    <select
      id={id}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Top level (no parent) —</option>
      {options.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} — {a.name}
        </option>
      ))}
    </select>
  );
}

function AccountTreeRows({
  nodes,
  byParent,
  depth,
  onEdit,
  onDelete,
}: {
  nodes: ChartCoaAccount[];
  byParent: Map<string | null, ChartCoaAccount[]>;
  depth: number;
  onEdit: (a: ChartCoaAccount) => void;
  onDelete: (a: ChartCoaAccount) => void;
}) {
  const [, setLocation] = useLocation();

  return (
    <>
      {nodes.map((acct) => {
        const kids = byParent.get(acct.id) ?? [];
        return (
          <Fragment key={acct.id}>
            <TableRow className={cn(!acct.isActive && "opacity-60")}>
              <TableCell
                className="font-mono font-medium text-muted-foreground align-middle"
                style={{ paddingLeft: `${12 + depth * 20}px` }}
              >
                <span className="inline-flex items-center gap-2">
                  {depth > 0 && (
                    <span className="text-muted-foreground/50 select-none" aria-hidden>
                      └
                    </span>
                  )}
                  {acct.code}
                </span>
              </TableCell>
              <TableCell className="align-middle">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-medium cursor-pointer hover:underline hover:text-primary"
                    onClick={() => setLocation(`/accounts/${acct.id}/ledger`)}
                  >
                    {acct.name}
                  </span>
                  {acct.isSystem && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      System
                    </span>
                  )}
                  {!acct.isActive && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Inactive
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {acct.balance != null
                  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(acct.balance))
                  : "—"}
              </TableCell>
              <TableCell className="text-right align-middle whitespace-nowrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(acct)}
                  title="Edit account"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  disabled={acct.isSystem}
                  title={acct.isSystem ? "System accounts cannot be deleted" : "Delete account"}
                  onClick={() => {
                    if (acct.isSystem) return;
                    if (confirm(`Delete account ${acct.code} — ${acct.name}?`)) onDelete(acct);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
            {kids.length > 0 && (
              <AccountTreeRows
                nodes={kids}
                byParent={byParent}
                depth={depth + 1}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export default function AccountsPage() {
  const { data: accounts = [], isLoading } = useChartOfAccounts();
  const createAccount = useCreateChartAccount();
  const updateAccount = useUpdateChartAccount();
  const deleteAccount = useDeleteChartAccount();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChartCoaAccount | null>(null);

  const grouped = useMemo(() => {
    const g: Record<string, ChartCoaAccount[]> = {};
    for (const t of COA_TYPES) g[t] = [];
    for (const a of accounts) {
      if (g[a.type]) g[a.type].push(a);
    }
    return g;
  }, [accounts]);

  const byParentGlobal = useMemo(() => childrenByParentId(accounts), [accounts]);

  const handleDelete = async (acct: ChartCoaAccount) => {
    try {
      await deleteAccount.mutateAsync(acct.id);
      toast.success("Account deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete account");
    }
  };

  return (
    <AppLayout title="Chart of Accounts">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <p className="text-muted-foreground">Manage your General Ledger accounts (same list as Bank Register and reports).</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use a parent account to group detail accounts — for example, place checking under <strong>Cash &amp; Bank</strong> (same account type).
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Add Account
            </Button>
          </DialogTrigger>
          <AddAccountDialogContent open={addOpen} onClose={() => setAddOpen(false)} grouped={grouped} createAccount={createAccount} />
        </Dialog>
      </div>

      <EditAccountDialog
        account={editTarget}
        onClose={() => setEditTarget(null)}
        grouped={grouped}
        byParentGlobal={byParentGlobal}
        updateAccount={updateAccount}
      />

      <div className="space-y-8">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading chart of accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border border-dashed rounded-xl text-muted-foreground">
            No accounts configured yet.
          </div>
        ) : (
          COA_TYPES.map((type) => {
            const list = grouped[type] || [];
            if (list.length === 0) return null;
            const byParent = childrenByParentId(list);
            const roots = rootsForType(list, byParent);
            return (
              <div key={type} className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-6 py-3 border-b border-border font-semibold text-sm tracking-wide text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  {TYPE_LABELS[type] ?? type}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right w-36">GL Balance</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AccountTreeRows
                        nodes={roots}
                        byParent={byParent}
                        depth={0}
                        onEdit={setEditTarget}
                        onDelete={handleDelete}
                      />
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}

function AddAccountDialogContent({
  open,
  onClose,
  grouped,
  createAccount,
}: {
  open: boolean;
  onClose: () => void;
  grouped: Record<string, ChartCoaAccount[]>;
  createAccount: ReturnType<typeof useCreateChartAccount>;
}) {
  const [type, setType] = useState<string>("EXPENSE");
  const [parentId, setParentId] = useState("");
  const typeList = grouped[type] ?? [];

  useEffect(() => {
    if (!open) return;
    setType("EXPENSE");
    setParentId("");
  }, [open]);

  useEffect(() => {
    setParentId("");
  }, [type]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = (fd.get("code") as string)?.trim();
    const name = (fd.get("name") as string)?.trim();
    const description = (fd.get("description") as string)?.trim() || undefined;
    const parent = parentId && parentId !== "" ? parentId : null;
    if (!code || !name) {
      toast.error("Code and name are required");
      return;
    }
    try {
      await createAccount.mutateAsync({
        code,
        name,
        type,
        description,
        parentId: parent,
      });
      toast.success("Account created");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New GL account</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-code">Account code</Label>
            <Input id="new-code" name="code" required placeholder="e.g. 1015" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-type">Account type</Label>
            <select
              id="new-type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {COA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-name">Account name</Label>
          <Input id="new-name" name="name" required placeholder="e.g. Payroll checking" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-parent">Parent account (optional)</Label>
          <p className="text-xs text-muted-foreground">Only accounts of the same type are listed.</p>
          <ParentAccountSelect
            id="add-parent"
            value={parentId}
            onChange={setParentId}
            accounts={typeList}
            excludeIds={new Set()}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-desc">Description (optional)</Label>
          <Textarea id="new-desc" name="description" rows={2} placeholder="Optional notes" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createAccount.isPending}>
            Save account
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditAccountDialog({
  account,
  onClose,
  grouped,
  byParentGlobal,
  updateAccount,
}: {
  account: ChartCoaAccount | null;
  onClose: () => void;
  grouped: Record<string, ChartCoaAccount[]>;
  byParentGlobal: Map<string | null, ChartCoaAccount[]>;
  updateAccount: ReturnType<typeof useUpdateChartAccount>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    if (!account) return;
    setName(account.name);
    setCode(account.code);
    setDescription(account.description ?? "");
    setIsActive(account.isActive);
    setParentId(account.parentId ?? "");
  }, [account]);

  const typeList = account ? grouped[account.type] ?? [] : [];
  const excludeIds = useMemo(() => {
    if (!account) return new Set<string>();
    const ex = new Set<string>([account.id]);
    for (const d of collectDescendantIds(account.id, byParentGlobal)) ex.add(d);
    return ex;
  }, [account, byParentGlobal]);

  const handleSave = async () => {
    if (!account) return;
    const n = name.trim();
    if (!n) {
      toast.error("Name is required");
      return;
    }
    const payload: {
      name: string;
      description?: string | null;
      isActive: boolean;
      parentId: string | null;
      code?: string;
    } = {
      name: n,
      description: description.trim() || null,
      isActive,
      parentId: parentId && parentId !== "" ? parentId : null,
    };
    if (!account.isSystem) {
      const c = code.trim();
      if (!c) {
        toast.error("Account code is required");
        return;
      }
      payload.code = c;
    }
    try {
      await updateAccount.mutateAsync({ id: account.id, data: payload });
      toast.success("Account updated");
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update account");
    }
  };

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
        </DialogHeader>
        {account && (
          <div className="space-y-4 pt-1">
            <div className="text-xs text-muted-foreground font-mono">
              {account.code} · {TYPE_LABELS[account.type] ?? account.type}
              {account.isSystem && (
                <span className="ml-2 text-foreground/80">(system — code locked)</span>
              )}
            </div>
            {!account.isSystem && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-code">Account code</Label>
                <Input id="edit-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Account name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-parent">Parent account</Label>
              <p className="text-xs text-muted-foreground">Same type only. Clear to make this a top-level account.</p>
              <ParentAccountSelect
                id="edit-parent"
                value={parentId}
                onChange={setParentId}
                accounts={typeList}
                excludeIds={excludeIds}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                className="rounded border-input"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <Label htmlFor="edit-active" className="font-normal cursor-pointer">
                Account is active
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={updateAccount.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
