import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Heart, ChevronDown, ChevronRight, Printer, Download,
  TrendingUp, Users, Gift, Calendar, Search, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (res.status === 401) window.location.href = `${import.meta.env.BASE_URL}login`;
  return res;
}

const BASE = import.meta.env.BASE_URL;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: string | Date) {
  if (!d) return "—";
  const s = d instanceof Date ? d.toISOString() : d;
  return format(parseISO(s.substring(0, 10)), "MMM d, yyyy");
}

interface DonorSummary {
  donorName: string;
  giftCount: number;
  totalGiven: number;
  firstGift: string;
  lastGift: string;
}

interface GiftRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  memo: string | null;
  checkNumber: string | null;
  fundName: string | null;
  source: "bank_register" | "donation_record";
}

function useDonors(year: string) {
  return useQuery<DonorSummary[]>({
    queryKey: ["donors", year],
    queryFn: async () => {
      const url = year && year !== "all"
        ? `${BASE}api/donors?year=${year}`
        : `${BASE}api/donors`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("Failed to load donors");
      return res.json();
    },
  });
}

function useDonorHistory(donorName: string | null, year: string) {
  return useQuery<GiftRecord[]>({
    queryKey: ["donor-history", donorName, year],
    enabled: !!donorName,
    queryFn: async () => {
      const yearParam = year && year !== "all" ? `?year=${year}` : "";
      const res = await apiFetch(`${BASE}api/donors/${encodeURIComponent(donorName!.trim())}/history${yearParam}`);
      if (!res.ok) throw new Error("Failed to load donor history");
      return res.json();
    },
  });
}

function useDonorYears() {
  return useQuery<number[]>({
    queryKey: ["donor-years"],
    queryFn: async () => {
      const res = await apiFetch(`${BASE}api/donors/years`);
      if (!res.ok) return [];
      return res.json();
    },
  });
}

/* ─── Print Statement ──────────────────────────────────────────────────── */
function printStatement(donor: DonorSummary, gifts: GiftRecord[], year: string, orgName: string) {
  const yearLabel = year && year !== "all" ? `Year ${year}` : "All Time";
  const rows = gifts.map(g => `
    <tr>
      <td>${fmtDate(g.date)}</td>
      <td>${g.description || "Gift"}</td>
      <td>${g.fundName || "—"}</td>
      <td>${g.memo || "—"}</td>
      <td style="text-align:right">${fmt(g.amount)}</td>
    </tr>
  `).join("");

  const html = `
    <!DOCTYPE html><html><head>
    <title>Donor Statement — ${donor.donorName}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #111; font-size: 13px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .org { font-size: 14px; color: #555; margin-bottom: 24px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; background: #f6f6f6; padding: 16px; border-radius: 6px; }
      .meta label { font-size: 11px; text-transform: uppercase; color: #888; }
      .meta span { font-size: 14px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { text-align: left; border-bottom: 2px solid #ddd; padding: 6px 8px; font-size: 11px; text-transform: uppercase; color: #555; }
      td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
      tfoot td { font-weight: bold; border-top: 2px solid #ddd; border-bottom: none; }
      .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px; }
      @media print { body { padding: 20px; } }
    </style>
    </head><body>
    <h1>Donor Giving Statement</h1>
    <div class="org">${orgName} &bull; ${yearLabel}</div>
    <div class="meta">
      <div><label>Donor</label><br/><span>${donor.donorName}</span></div>
      <div><label>Total Given</label><br/><span>${fmt(donor.totalGiven)}</span></div>
      <div><label>Number of Gifts</label><br/><span>${donor.giftCount}</span></div>
      <div><label>Gift Period</label><br/><span>${fmtDate(donor.firstGift)} – ${fmtDate(donor.lastGift)}</span></div>
    </div>
    <table>
      <thead><tr>
        <th>Date</th><th>Description</th><th>Fund</th><th>Note</th><th style="text-align:right">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4">Total</td><td style="text-align:right">${fmt(donor.totalGiven)}</td>
      </tr></tfoot>
    </table>
    <div class="footer">
      This statement was generated by MissionLedger on ${format(new Date(), "MMMM d, yyyy")}.
      No goods or services were provided in exchange for these contributions unless noted above.
      Please retain this document for your tax records.
    </div>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

/* ─── Donor Row ─────────────────────────────────────────────────────────── */
function DonorRow({
  donor, rank, expanded, onToggle, year, orgName,
}: {
  donor: DonorSummary;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  year: string;
  orgName: string;
}) {
  const { data: history, isLoading } = useDonorHistory(expanded ? donor.donorName : null, year);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-muted/50 transition-colors border-b border-border"
        onClick={onToggle}
      >
        <td className="py-3 px-4 w-8 text-muted-foreground text-sm">{rank}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="font-medium text-foreground">{donor.donorName}</span>
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground hidden sm:table-cell">
          {donor.giftCount} {donor.giftCount === 1 ? "gift" : "gifts"}
        </td>
        <td className="py-3 px-4 hidden md:table-cell text-sm text-muted-foreground">{fmtDate(donor.firstGift)}</td>
        <td className="py-3 px-4 hidden md:table-cell text-sm text-muted-foreground">{fmtDate(donor.lastGift)}</td>
        <td className="py-3 px-4 text-right font-semibold text-emerald-700 tabular-nums">{fmt(donor.totalGiven)}</td>
        <td className="py-3 px-4 text-right">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              if (history) printStatement(donor, history, year, orgName);
            }}
            disabled={!history}
            title="Print Giving Statement"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30 border-b border-border">
          <td colSpan={7} className="px-4 py-3">
            {isLoading ? (
              <div className="space-y-2 py-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : !history?.length ? (
              <p className="text-sm text-muted-foreground text-center py-2">No gift records found.</p>
            ) : (
              <div className="rounded-md border border-border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Fund</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">Note</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Source</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((g) => (
                      <tr key={g.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 text-sm">{fmtDate(g.date)}</td>
                        <td className="px-3 py-2 text-sm hidden sm:table-cell text-muted-foreground">{g.description || "—"}</td>
                        <td className="px-3 py-2 text-sm hidden md:table-cell text-muted-foreground">{g.fundName || "—"}</td>
                        <td className="px-3 py-2 text-sm hidden lg:table-cell text-muted-foreground">{g.memo || "—"}</td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            g.source === "bank_register"
                              ? "text-blue-700 border-blue-200 bg-blue-50"
                              : "text-violet-700 border-violet-200 bg-violet-50"
                          )}>
                            {g.source === "bank_register" ? "Bank Register" : "Donation Record"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700 tabular-nums">{fmt(g.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(donor.totalGiven)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="px-3 py-2 flex justify-end border-t border-border bg-muted/20">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => printStatement(donor, history, year, orgName)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Statement
                  </Button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function DonorGivingPage() {
  const [year, setYear] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedDonor, setExpandedDonor] = useState<string | null>(null);

  const { data: donors = [], isLoading } = useDonors(year);
  const { data: years = [] } = useDonorYears();

  const filtered = useMemo(() => {
    if (!search.trim()) return donors;
    const q = search.toLowerCase();
    return donors.filter(d => d.donorName.toLowerCase().includes(q));
  }, [donors, search]);

  const totals = useMemo(() => ({
    total: donors.reduce((s, d) => s + d.totalGiven, 0),
    gifts: donors.reduce((s, d) => s + d.giftCount, 0),
    count: donors.length,
  }), [donors]);

  const orgName = (window as any).__missionledger_org_name ?? "Your Organization";

  function toggleDonor(name: string) {
    setExpandedDonor(prev => prev === name ? null : name);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-border bg-card px-4 sm:px-6 py-4 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Heart className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Donor Giving</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">Track donor contributions from bank register and donation records</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[130px] h-8 text-sm">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="px-4 sm:px-6 py-4 shrink-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Donors</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totals.count}</p>
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Gifts</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totals.gifts}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Total Given</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{fmt(totals.total)}</p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 sm:px-6 pb-3 shrink-0">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-8 text-sm"
              placeholder="Search donors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 pb-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : !filtered.length ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Heart className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">
                {donors.length === 0 ? "No donor records yet" : "No donors match your search"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {donors.length === 0
                  ? "When you add a credit transaction in the Bank Register, tag it with a donor name to start tracking giving."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase">Donor</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Gifts</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">First Gift</th>
                    <th className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Last Gift</th>
                    <th className="py-2.5 px-4 text-right text-xs font-semibold text-muted-foreground uppercase">Total Given</th>
                    <th className="py-2.5 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((donor, idx) => (
                    <DonorRow
                      key={donor.donorName}
                      donor={donor}
                      rank={idx + 1}
                      expanded={expandedDonor === donor.donorName}
                      onToggle={() => toggleDonor(donor.donorName)}
                      year={year}
                      orgName={orgName}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Showing {filtered.length} donor{filtered.length !== 1 ? "s" : ""}
              {year !== "all" ? ` for ${year}` : ""} · Click a row to see gift history · Print statement from the printer icon
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
