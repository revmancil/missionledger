import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, Landmark, Scale, BookOpen,
  RefreshCw, Lock, RotateCcw, Info, Plus, Trash2, Layers,
  Building2, CreditCard, Wallet, ChevronRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;
const api = (url: string, init?: RequestInit) =>
  fetch(url, { credentials: "include", ...init });

// ── Types ─────────────────────────────────────────────────────────────────────
type Method = "CASH" | "ACCRUAL";
type TabKey = "bank" | "assets" | "liabilities";

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  isSystem: boolean;
  isLinkedBankAccount?: boolean;
  linkedBankName?: string;
  linkedAccountType?: string;
  isPlaidLinked?: boolean;
}

interface FundRecord {
  id: string;
  name: string;
  fundType?: string;
}

interface BalanceRow {
  id: string;       // local UUID
  accountId: string;
  fundId: string;
  amount: string;
  memo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function parseAmt(s: string) { return parseFloat(s.replace(/[^0-9.-]/g, "")) || 0; }
function uid() { return crypto.randomUUID(); }

/**
 * Classify ASSET accounts as "bank/cash" or "other assets".
 * Priority: explicit bank-account annotation from the API (covers Plaid),
 * then code range 1000-1099, then name keywords.
 */
function isBankAccount(acct: CoaAccount) {
  if (acct.isLinkedBankAccount) return true;
  const code = parseInt(acct.code, 10);
  if (!isNaN(code) && code >= 1000 && code <= 1099) return true;
  const nameLower = acct.name.toLowerCase();
  return (
    nameLower.includes("cash") ||
    nameLower.includes("bank") ||
    nameLower.includes("checking") ||
    nameLower.includes("savings") ||
    nameLower.includes("money market") ||
    nameLower.includes("petty cash")
  );
}

/** Friendly display label for an account in the dropdown */
function accountLabel(acct: CoaAccount): string {
  const displayName = acct.linkedBankName ?? acct.name;
  return `${acct.code} - ${displayName}`;
}

// ── Method Toggle ─────────────────────────────────────────────────────────────
function MethodToggle({ value, onChange }: { value: Method; onChange: (v: Method) => void }) {
  return (
    <div className="inline-flex rounded-xl border-2 border-gray-200 overflow-hidden bg-gray-50">
      {(["CASH", "ACCRUAL"] as Method[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-5 py-2 text-sm font-semibold transition-all duration-150",
            value === m
              ? m === "CASH" ? "bg-[hsl(210,60%,25%)] text-white shadow-sm" : "bg-[hsl(174,60%,38%)] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          )}
        >
          {m === "CASH" ? "Cash Basis" : "Accrual Basis"}
        </button>
      ))}
    </div>
  );
}

// ── Row Table ─────────────────────────────────────────────────────────────────
function RowTable({
  rows, accounts, funds, defaultFundId, accountType,
  onAddRow, onUpdateRow, onDeleteRow,
  emptyLabel,
}: {
  rows: BalanceRow[];
  accounts: CoaAccount[];
  funds: FundRecord[];
  defaultFundId: string;
  accountType: "ASSET" | "LIABILITY";
  onAddRow: () => void;
  onUpdateRow: (id: string, field: keyof BalanceRow, val: string) => void;
  onDeleteRow: (id: string) => void;
  emptyLabel: string;
}) {
  const usedAccountIds = new Set(rows.map((r) => r.accountId).filter(Boolean));

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[2fr_1.5fr_1.2fr_1fr_auto] gap-0 bg-gray-50 border-b">
        <div className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Account</div>
        <div className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fund</div>
        <div className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Amount</div>
        <div className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Memo</div>
        <div className="px-4 py-2.5 w-10" />
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">{emptyLabel}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map((row) => {
            const availableAccounts = accounts.filter(
              (a) => !usedAccountIds.has(a.id) || a.id === row.accountId
            );
            const hasAmount = parseAmt(row.amount) > 0;
            const hasFund = !!row.fundId;
            const rowValid = hasAmount && hasFund && !!row.accountId;

            return (
              <div
                key={row.id}
                className={cn(
                  "grid grid-cols-[2fr_1.5fr_1.2fr_1fr_auto] gap-0 items-center px-0 py-1.5 group",
                  rowValid ? "bg-white" : "bg-amber-50/30"
                )}
              >
                {/* Account */}
                <div className="px-3">
                  <select
                    value={row.accountId}
                    onChange={(e) => onUpdateRow(row.id, "accountId", e.target.value)}
                    className="w-full h-8 text-sm border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(210,60%,40%)]"
                  >
                    <option value="">— Select account —</option>
                    {availableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountLabel(a)}{a.isPlaidLinked ? " ⟳" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fund */}
                <div className="px-2">
                  <select
                    value={row.fundId}
                    onChange={(e) => onUpdateRow(row.id, "fundId", e.target.value)}
                    className={cn(
                      "w-full h-8 text-sm border rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400",
                      !row.fundId ? "border-amber-300" : "border-gray-200"
                    )}
                  >
                    <option value="">— Select fund —</option>
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div className="px-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => onUpdateRow(row.id, "amount", e.target.value)}
                      className={cn(
                        "pl-6 h-8 text-sm text-right font-mono tabular-nums",
                        hasAmount ? "border-blue-300 bg-white" : ""
                      )}
                    />
                  </div>
                </div>

                {/* Memo */}
                <div className="px-2">
                  <Input
                    type="text"
                    placeholder="Optional memo…"
                    value={row.memo}
                    onChange={(e) => onUpdateRow(row.id, "memo", e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Delete */}
                <div className="px-2 flex justify-center">
                  <button
                    onClick={() => onDeleteRow(row.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Row footer */}
      <div className="border-t bg-gray-50 px-4 py-2 flex items-center justify-between">
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 text-sm text-[hsl(210,60%,35%)] hover:text-[hsl(210,60%,25%)] font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add row
        </button>
        {rows.length > 0 && (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {fmt(rows.reduce((s, r) => s + parseAmt(r.amount), 0))}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Confirmation Modal ─────────────────────────────────────────────────────────
function ConfirmModal({
  open, onClose, onConfirm, saving, error,
  bankRows, assetRows, liabilityRows,
  bankAccounts, allAssets, liabilityAccounts,
  funds, asOfDate, method,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  error: string;
  bankRows: BalanceRow[];
  assetRows: BalanceRow[];
  liabilityRows: BalanceRow[];
  bankAccounts: CoaAccount[];
  allAssets: CoaAccount[];
  liabilityAccounts: CoaAccount[];
  funds: FundRecord[];
  asOfDate: string;
  method: Method;
}) {
  const acctMap = Object.fromEntries([...bankAccounts, ...allAssets, ...liabilityAccounts].map((a) => [a.id, a]));
  const fundMap = Object.fromEntries(funds.map((f) => [f.id, f]));

  const allAssetRows = [...bankRows, ...assetRows];
  const totalAssets = allAssetRows.reduce((s, r) => s + parseAmt(r.amount), 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + parseAmt(r.amount), 0);
  const totalNetAssets = totalAssets - totalLiabilities;

  // Fund summary
  const fundIds = [...new Set([...allAssetRows, ...liabilityRows].map((r) => r.fundId).filter(Boolean))];
  const fundSummary = fundIds.map((fid) => {
    const fa = allAssetRows.filter((r) => r.fundId === fid).reduce((s, r) => s + parseAmt(r.amount), 0);
    const fl = liabilityRows.filter((r) => r.fundId === fid).reduce((s, r) => s + parseAmt(r.amount), 0);
    return { fund: fundMap[fid], assets: fa, liabilities: fl, netAssets: fa - fl };
  });

  const allRows = [
    ...allAssetRows.map((r) => ({ ...r, accountType: "ASSET" as const })),
    ...liabilityRows.map((r) => ({ ...r, accountType: "LIABILITY" as const })),
  ].filter((r) => parseAmt(r.amount) > 0 && r.accountId && r.fundId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[hsl(210,60%,25%)]">Confirm Opening Balances</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              You are about to establish <strong>{fmt(totalAssets)}</strong> in Assets
              {totalLiabilities > 0 && <> and <strong>{fmt(totalLiabilities)}</strong> in Liabilities</>}
              {" "}across <strong>{fundIds.length} fund{fundIds.length !== 1 ? "s" : ""}</strong>.
              A journal entry will be posted and <strong>cannot be edited</strong> (only replaced).
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {/* Fund breakdown */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-violet-500" /> Fund Summary
              </p>
            </div>
            <div className="divide-y">
              {fundSummary.map(({ fund, assets, liabilities, netAssets }) => (
                <div key={fund?.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{fund?.name ?? "Unknown Fund"}</span>
                  <div className="flex items-center gap-6 text-right">
                    {assets > 0 && <span className="text-blue-700">Assets {fmt(assets)}</span>}
                    {liabilities > 0 && <span className="text-orange-700">Liabilities {fmt(liabilities)}</span>}
                    <span className={cn("font-semibold", netAssets >= 0 ? "text-violet-700" : "text-red-600")}>
                      Net {fmt(netAssets)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 bg-gray-50 border-t flex items-center justify-between text-sm font-bold">
              <span>Total Net Assets</span>
              <span className={cn("tabular-nums", totalNetAssets >= 0 ? "text-violet-700" : "text-red-600")}>{fmt(totalNetAssets)}</span>
            </div>
          </div>

          {/* JE Preview */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-[hsl(210,40%,97%)] border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-[hsl(210,60%,25%)]">Journal Entry Preview</p>
              <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                As of {asOfDate ? format(new Date(asOfDate), "MMM d, yyyy") : "—"}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wide w-24">Debit</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wide w-24">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allRows.map((row) => {
                  const acct = acctMap[row.accountId];
                  const fund = fundMap[row.fundId];
                  const amt = parseAmt(row.amount);
                  const isAsset = row.accountType === "ASSET";
                  return (
                    <React.Fragment key={row.id}>
                      {/* Asset/Liability line */}
                      <tr className={isAsset ? "bg-blue-50/20" : "bg-orange-50/20"}>
                        <td className="px-4 py-1.5">
                          <span className="font-mono text-muted-foreground mr-1.5">{acct?.code}</span>
                          {acct?.name ?? "—"}
                        </td>
                        <td className="px-4 py-1.5 text-violet-600 text-[11px]">{fund?.name}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-blue-700">
                          {isAsset ? fmt(amt) : "—"}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-orange-700">
                          {!isAsset ? fmt(amt) : "—"}
                        </td>
                      </tr>
                      {/* Balancing Net Assets line */}
                      <tr className="bg-violet-50/20">
                        <td className="px-4 py-1.5 pl-8 text-muted-foreground italic text-[11px]">
                          Net Assets — {fund?.name ?? "Fund"}
                          <span className="ml-1.5 text-violet-400">(auto)</span>
                        </td>
                        <td className="px-4 py-1.5 text-violet-600 text-[11px]">{fund?.name}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                          {!isAsset ? fmt(amt) : "—"}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-violet-700">
                          {isAsset ? fmt(amt) : "—"}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-2 font-bold text-sm">Totals</td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-blue-700">{fmt(totalAssets * 2)}</td>
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-violet-700">{fmt(totalAssets * 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
          >
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Posting…</>
              : <><Lock className="h-4 w-4" /> Confirm & Post Entry</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Phase = "wizard" | "done";

export default function OpeningBalancePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [phase, setPhase]       = useState<Phase>("wizard");
  const [method, setMethod]     = useState<Method>("CASH");
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState<TabKey>("bank");
  const [defaultFundId, setDefaultFundId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [allCoa, setAllCoa]         = useState<CoaAccount[]>([]);
  const [funds, setFunds]           = useState<FundRecord[]>([]);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [createdEntry, setCreatedEntry] = useState<any>(null);

  // Row state per tab
  const [bankRows, setBankRows]           = useState<BalanceRow[]>([]);
  const [assetRows, setAssetRows]         = useState<BalanceRow[]>([]);
  const [liabilityRows, setLiabilityRows] = useState<BalanceRow[]>([]);

  // ── Derived account lists ──────────────────────────────────────────────────
  const bankAccounts  = useMemo(() => allCoa.filter((a) => a.type === "ASSET" && isBankAccount(a)), [allCoa]);
  const otherAssets   = useMemo(() => allCoa.filter((a) => a.type === "ASSET" && !isBankAccount(a)), [allCoa]);
  const liabilityAccts = useMemo(() => allCoa.filter((a) => a.type === "LIABILITY"), [allCoa]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`${BASE}api/opening-balance`);
      if (!res.ok) return;
      const data = await res.json();
      setMethod(data.accountingMethod ?? "CASH");
      setAllCoa([
        ...(data.coa?.ASSET ?? []),
        ...(data.coa?.LIABILITY ?? []),
        ...(data.coa?.EQUITY ?? []),
      ]);
      setFunds(data.funds ?? []);
      setExistingEntryId(data.openingBalanceEntryId ?? null);
      if (data.openingBalanceDate) setAsOfDate(data.openingBalanceDate.slice(0, 10));

      // Set default fund to first fund if available
      if ((data.funds ?? []).length > 0 && !defaultFundId) {
        setDefaultFundId(data.funds[0].id);
      }

      // Pre-fill rows from existing JE data
      if (data.existingRows?.length) {
        const bankCoaIds = new Set(
          [...(data.coa?.ASSET ?? [])].filter(isBankAccount).map((a: CoaAccount) => a.id)
        );
        const newBankRows: BalanceRow[] = [];
        const newAssetRows: BalanceRow[] = [];
        const newLiabilityRows: BalanceRow[] = [];

        for (const row of data.existingRows) {
          const entry: BalanceRow = {
            id: uid(),
            accountId: row.accountId,
            fundId: row.fundId ?? "",
            amount: String(row.amount),
            memo: row.memo ?? "",
          };
          if (row.accountType === "ASSET") {
            if (bankCoaIds.has(row.accountId)) newBankRows.push(entry);
            else newAssetRows.push(entry);
          } else if (row.accountType === "LIABILITY") {
            newLiabilityRows.push(entry);
          }
        }
        if (newBankRows.length) setBankRows(newBankRows);
        if (newAssetRows.length) setAssetRows(newAssetRows);
        if (newLiabilityRows.length) setLiabilityRows(newLiabilityRows);
        if (data.openingBalanceEntryId) setPhase("wizard");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Row operations ────────────────────────────────────────────────────────
  function makeNewRow(): BalanceRow {
    return { id: uid(), accountId: "", fundId: defaultFundId, amount: "", memo: "" };
  }

  function addRow(tab: TabKey) {
    const row = makeNewRow();
    if (tab === "bank") setBankRows((r) => [...r, row]);
    else if (tab === "assets") setAssetRows((r) => [...r, row]);
    else setLiabilityRows((r) => [...r, row]);
  }

  function updateRow(tab: TabKey, id: string, field: keyof BalanceRow, val: string) {
    const updater = (rows: BalanceRow[]) =>
      rows.map((r) => r.id === id ? { ...r, [field]: val } : r);
    if (tab === "bank") setBankRows(updater);
    else if (tab === "assets") setAssetRows(updater);
    else setLiabilityRows(updater);
  }

  function deleteRow(tab: TabKey, id: string) {
    const updater = (rows: BalanceRow[]) => rows.filter((r) => r.id !== id);
    if (tab === "bank") setBankRows(updater);
    else if (tab === "assets") setAssetRows(updater);
    else setLiabilityRows(updater);
  }

  // ── Accounting method change ───────────────────────────────────────────────
  async function handleMethodChange(m: Method) {
    setMethod(m);
    await api(`${BASE}api/opening-balance/method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountingMethod: m }),
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalBankCash    = useMemo(() => bankRows.reduce((s, r) => s + parseAmt(r.amount), 0), [bankRows]);
  const totalOtherAssets = useMemo(() => assetRows.reduce((s, r) => s + parseAmt(r.amount), 0), [assetRows]);
  const totalAssets      = totalBankCash + totalOtherAssets;
  const totalLiabilities = useMemo(() => liabilityRows.reduce((s, r) => s + parseAmt(r.amount), 0), [liabilityRows]);
  const totalNetAssets   = totalAssets - totalLiabilities;

  // ── Validation ────────────────────────────────────────────────────────────
  const allRows = [
    ...bankRows.map((r) => ({ ...r, accountType: "ASSET" as const })),
    ...assetRows.map((r) => ({ ...r, accountType: "ASSET" as const })),
    ...(method === "ACCRUAL" ? liabilityRows.map((r) => ({ ...r, accountType: "LIABILITY" as const })) : []),
  ].filter((r) => parseAmt(r.amount) > 0);

  const futureDateError = asOfDate > format(new Date(), "yyyy-MM-dd");
  const missingFund     = allRows.some((r) => !r.fundId);
  const missingAccount  = allRows.some((r) => !r.accountId);
  const hasData         = allRows.length > 0;
  const canFinish       = hasData && !futureDateError && !missingFund && !missingAccount;

  function handleReviewClick() {
    setError("");
    if (futureDateError) { setError("As-of date cannot be in the future."); return; }
    if (!hasData) { setError("Please add at least one balance row before finishing."); return; }
    if (missingFund) { setError("Every row must have a Fund selected."); return; }
    if (missingAccount) { setError("Every row must have an Account selected."); return; }
    setShowConfirm(true);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    setSaving(true); setError("");
    try {
      const submitRows = [
        ...bankRows.filter((r) => parseAmt(r.amount) > 0 && r.accountId && r.fundId)
          .map((r) => ({ ...r, accountType: "ASSET" })),
        ...assetRows.filter((r) => parseAmt(r.amount) > 0 && r.accountId && r.fundId)
          .map((r) => ({ ...r, accountType: "ASSET" })),
        ...(method === "ACCRUAL"
          ? liabilityRows.filter((r) => parseAmt(r.amount) > 0 && r.accountId && r.fundId)
              .map((r) => ({ ...r, accountType: "LIABILITY" }))
          : []),
      ].map((r) => ({
        accountId: r.accountId,
        accountType: r.accountType,
        fundId: r.fundId,
        fundName: funds.find((f) => f.id === r.fundId)?.name ?? "Fund",
        amount: parseAmt(r.amount),
        memo: r.memo,
      }));

      const res = await api(`${BASE}api/opening-balance/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: asOfDate, accountingMethod: method, rows: submitRows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save opening balance"); return; }
      setCreatedEntry(data);
      setShowConfirm(false);
      setPhase("done");
    } finally { setSaving(false); }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-40" />
        </div>
      </AppLayout>
    );
  }

  // ── DONE phase ────────────────────────────────────────────────────────────
  if (phase === "done" && createdEntry) {
    return (
      <AppLayout title="Opening Balance Wizard">
        <div className="max-w-lg mx-auto py-10 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balances Set!</h2>
            <p className="text-muted-foreground mt-1">
              Journal Entry <strong>{createdEntry.entryNumber}</strong> has been posted.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-left space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Assets</span>
              <span className="font-semibold text-blue-700">{fmt(createdEntry.totalAssets)}</span>
            </div>
            {createdEntry.totalLiabilities > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Liabilities</span>
                <span className="font-semibold text-orange-700">{fmt(createdEntry.totalLiabilities)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground font-semibold">Total Net Assets</span>
              <span className="font-bold text-violet-700">{fmt(createdEntry.totalNetAssets)}</span>
            </div>
            {createdEntry.fundSummary?.length > 0 && (
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="h-3 w-3 text-violet-500" /> By Fund
                </p>
                {createdEntry.fundSummary.map((fs: any) => (
                  <div key={fs.fundId} className="flex justify-between text-sm pl-3">
                    <span className="text-muted-foreground">{fs.fundName}</span>
                    <span className="font-semibold text-violet-600">{fmt(fs.netAssets)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Accounting Method</span>
              <span className="font-semibold">{method === "CASH" ? "Cash Basis" : "Accrual Basis"}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Lock className="h-4 w-4 shrink-0" />
            Journal entry <strong>{createdEntry.entryNumber}</strong> is posted and locked in the ledger
          </div>
          <Button variant="outline" className="gap-2" onClick={() => { setPhase("wizard"); setCreatedEntry(null); load(); }}>
            <RotateCcw className="h-4 w-4" /> Edit Balances
          </Button>
        </div>
      </AppLayout>
    );
  }

  // ── WIZARD phase ──────────────────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number; total: number }[] = [
    {
      key: "bank",
      label: "Bank / Cash",
      icon: <Wallet className="h-4 w-4" />,
      count: bankRows.filter((r) => parseAmt(r.amount) > 0).length,
      total: totalBankCash,
    },
    {
      key: "assets",
      label: "Other Assets",
      icon: <Building2 className="h-4 w-4" />,
      count: assetRows.filter((r) => parseAmt(r.amount) > 0).length,
      total: totalOtherAssets,
    },
    {
      key: "liabilities",
      label: "Liabilities",
      icon: <CreditCard className="h-4 w-4" />,
      count: liabilityRows.filter((r) => parseAmt(r.amount) > 0).length,
      total: totalLiabilities,
    },
  ];

  return (
    <AppLayout title="Opening Balance Wizard">
      <div className="space-y-5 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[hsl(210,60%,25%)]">Opening Balance Wizard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set your organization's starting balances — every entry is allocated to a specific Fund
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accounting Method</Label>
              <div className="mt-1"><MethodToggle value={method} onChange={handleMethodChange} /></div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">As of Date</Label>
              <input
                type="date"
                value={asOfDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setAsOfDate(e.target.value)}
                className={cn(
                  "mt-1 block h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(210,60%,40%)] bg-white",
                  futureDateError ? "border-red-400" : "border-gray-200"
                )}
              />
              {futureDateError && <p className="text-[11px] text-red-600 mt-0.5">Date cannot be in the future</p>}
            </div>
          </div>
        </div>

        {/* Default Fund + explainer */}
        <div className="flex flex-wrap items-start gap-4 p-4 rounded-xl border border-violet-100 bg-violet-50">
          <div className="flex items-start gap-2 text-sm text-violet-800 flex-1 min-w-0">
            <Layers className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
            <span>
              <strong>Fund-first accounting:</strong> Every balance you enter is allocated to a specific Fund. The system
              automatically creates a balancing <em>Net Assets — [Fund Name]</em> entry so your Statement of Financial
              Position is correct from day one.
            </span>
          </div>
          {funds.length > 0 && (
            <div className="shrink-0">
              <Label className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Default Fund</Label>
              <select
                value={defaultFundId}
                onChange={(e) => setDefaultFundId(e.target.value)}
                className="mt-1 block h-9 px-3 rounded-lg border border-violet-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-violet-900"
              >
                <option value="">— None —</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {funds.length === 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>No funds found.</strong> Please create at least one Fund (e.g., "General Fund") in the Funds module before setting opening balances. Each balance row requires a fund assignment.
            </span>
          </div>
        )}

        {existingEntryId && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <Info className="h-4 w-4 shrink-0" />
            An existing opening balance entry is already posted. Saving new balances will void and replace it.
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (allCoa.length === 0) load(); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all -mb-px",
                activeTab === tab.key
                  ? "bg-white border-[hsl(210,60%,25%)] text-[hsl(210,60%,25%)]"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-gray-50"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  activeTab === tab.key ? "bg-[hsl(210,60%,25%)] text-white" : "bg-gray-200 text-gray-600"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pt-1">
          {activeTab === "bank" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4 text-blue-500" />
                Checking, savings, petty cash — accounts in the 1000–1099 range or linked bank accounts
              </div>
              {bankAccounts.length === 0 && !loading && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    No bank or cash accounts found in your Chart of Accounts.
                    Go to <strong>Chart of Accounts</strong> and add a Bank or Cash account (code 1000–1099) first, or link a bank account via Plaid.
                  </span>
                </div>
              )}
              <RowTable
                rows={bankRows}
                accounts={bankAccounts}
                funds={funds}
                defaultFundId={defaultFundId}
                accountType="ASSET"
                onAddRow={() => addRow("bank")}
                onUpdateRow={(id, f, v) => updateRow("bank", id, f, v)}
                onDeleteRow={(id) => deleteRow("bank", id)}
                emptyLabel="No bank accounts entered yet. Click 'Add row' to add your checking or savings account balance."
              />
            </div>
          )}

          {activeTab === "assets" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4 text-blue-500" />
                Equipment, vehicles, buildings, receivables — excludes bank/cash accounts
              </div>
              {otherAssets.length === 0 && !loading && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    No other asset accounts found. Go to <strong>Chart of Accounts</strong> and add accounts like
                    Accounts Receivable (1100), Pledges Receivable (1200), or Property &amp; Equipment (1500).
                  </span>
                </div>
              )}
              <RowTable
                rows={assetRows}
                accounts={otherAssets}
                funds={funds}
                defaultFundId={defaultFundId}
                accountType="ASSET"
                onAddRow={() => addRow("assets")}
                onUpdateRow={(id, f, v) => updateRow("assets", id, f, v)}
                onDeleteRow={(id) => deleteRow("assets", id)}
                emptyLabel="No other assets entered yet. Add equipment, property, accounts receivable, etc."
              />
            </div>
          )}

          {activeTab === "liabilities" && (
            <div className="space-y-3">
              {method === "CASH" && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>Liabilities are not tracked in <strong>Cash Basis</strong> accounting. Switch to <strong>Accrual Basis</strong> to enter loans, credit cards, and accounts payable.</span>
                </div>
              )}
              {method === "ACCRUAL" && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CreditCard className="h-4 w-4 text-orange-500" />
                    Loans, mortgages, credit cards, accounts payable — 2000-series
                  </div>
                  <RowTable
                    rows={liabilityRows}
                    accounts={liabilityAccts}
                    funds={funds}
                    defaultFundId={defaultFundId}
                    accountType="LIABILITY"
                    onAddRow={() => addRow("liabilities")}
                    onUpdateRow={(id, f, v) => updateRow("liabilities", id, f, v)}
                    onDeleteRow={(id) => deleteRow("liabilities", id)}
                    emptyLabel="No liabilities entered yet. Add loans, mortgages, credit card balances, or accounts payable."
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Balance summary bar */}
        <div className={cn(
          "rounded-xl border-2 px-6 py-4 flex flex-wrap items-center justify-between gap-4 transition-all",
          totalNetAssets < 0 ? "border-red-200 bg-red-50" : totalAssets > 0 ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"
        )}>
          <div className="flex items-center gap-6 flex-wrap text-sm font-semibold">
            <span className={cn("px-3 py-1.5 rounded-lg", totalAssets > 0 ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-400")}>
              Assets&nbsp;&nbsp;{fmt(totalAssets)}
            </span>
            {method === "ACCRUAL" && totalLiabilities > 0 && (
              <>
                <span className="text-muted-foreground">−</span>
                <span className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-800">
                  Liabilities&nbsp;&nbsp;{fmt(totalLiabilities)}
                </span>
                <span className="text-muted-foreground">=</span>
              </>
            )}
            <span className={cn("px-3 py-1.5 rounded-lg font-bold", totalNetAssets < 0 ? "bg-red-100 text-red-800" : totalNetAssets > 0 ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-400")}>
              Net Assets&nbsp;&nbsp;{fmt(totalNetAssets)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {error}
              </span>
            )}
            <Button
              onClick={handleReviewClick}
              disabled={!canFinish || funds.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
            >
              Review & Finish <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleFinalize}
        saving={saving}
        error={error}
        bankRows={bankRows}
        assetRows={assetRows}
        liabilityRows={liabilityRows}
        bankAccounts={bankAccounts}
        allAssets={[...bankAccounts, ...otherAssets]}
        liabilityAccounts={liabilityAccts}
        funds={funds}
        asOfDate={asOfDate}
        method={method}
      />
    </AppLayout>
  );
}
