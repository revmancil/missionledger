import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetProfitLossReport, useGetBalanceSheetReport, useGetCashFlowReport, useGetFunds } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BookOpen, FileText, Table2, Download, FileDown, ShieldCheck, AlertTriangle, CheckCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiUrl } from "@/lib/api-base";

// ── Fund type helpers ─────────────────────────────────────────────────────────
const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED:     "Unrestricted",
  RESTRICTED_TEMP:  "Temp. Restricted",
  RESTRICTED_PERM:  "Perm. Restricted",
  BOARD_DESIGNATED: "Board Designated",
};
const FUND_TYPE_COLORS: Record<string, string> = {
  UNRESTRICTED:     "bg-emerald-100 text-emerald-800",
  RESTRICTED_TEMP:  "bg-amber-100  text-amber-800",
  RESTRICTED_PERM:  "bg-red-100    text-red-800",
  BOARD_DESIGNATED: "bg-blue-100   text-blue-800",
};

// ── Shared fetch helper ────────────────────────────────────────────────────────
function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    setIsLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("ml_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(url, { credentials: "include", headers })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<T>;
      })
      .then((d) => {
        setData(d);
        setIsLoading(false);
      })
      .catch(() => {
        setData(null);
        setIsLoading(false);
      });
  }, [url]);

  return { data, isLoading };
}

// ── GL by Account types ────────────────────────────────────────────────────────
interface GlAccountEntry {
  id: string;
  date: string;
  sourceType: string;
  fundName: string | null;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  runningBalance: number;
  description: string | null;
}
interface GlAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  coaType: string;
  beginBalance: number;
  entries: GlAccountEntry[];
  periodDebit: number;
  periodCredit: number;
  endBalance: number;
}

// ── General Journal types ──────────────────────────────────────────────────────
interface JournalSplit {
  id: string;
  accountCode: string;
  accountName: string;
  fundName: string | null;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  description: string | null;
}
interface JournalGroup {
  groupKey: string;
  date: string;
  sourceType: string;
  referenceNumber: string | null;
  description: string;
  entries: JournalSplit[];
  totalDebits: number;
  totalCredits: number;
}

// ── Transaction Register types ─────────────────────────────────────────────────
interface RegisterTxn {
  groupKey: string;
  date: string;
  sourceType: string;
  description: string;
  memo: string | null;
  checkNumber: string | null;
  fundName: string | null;
  debitAccounts: string | null;
  creditAccounts: string | null;
  amount: number;
}

const SOURCE_LABELS: Record<string, string> = {
  TRANSACTION:     "Bank",
  JOURNAL_ENTRY:   "Journal Entry",
  OPENING_BALANCE: "Opening Balance",
  MANUAL_JE:       "Manual JE",
};

// ── 990 Preparer types ─────────────────────────────────────────────────────────
interface IrsLineAccount { code: string; name: string; total: number; }
interface IrsLine {
  line: string; label: string;
  programService: number; managementGeneral: number; fundraising: number; untagged: number; total: number;
  accounts: IrsLineAccount[];
}
interface PublicSupportTest {
  totalRevenue: number; totalPublicSupport: number; publicSupportPct: number;
  threshold: number; passes: boolean;
  publicSupportAccounts: { code: string; name: string; amount: number; }[];
}
interface PreparerData {
  period: { startDate: string; endDate: string; };
  irsLines: IrsLine[];
  totals: { grandTotal: number; totalProgram: number; totalMgmt: number; totalFundraising: number; };
  publicSupportTest: PublicSupportTest;
}

type Tab = "financial" | "gl" | "journal" | "register" | "prep990";

export default function ReportsPage() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab]             = useState<Tab>("financial");
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate]     = useState(`${currentYear}-12-31`);
  const [applied, setApplied]     = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });
  const [fundFilter, setFundFilter] = useState("");

  function endOfMonth(dateStr: string): string {
    if (!dateStr || dateStr.length < 7) return "";
    const [y, m] = dateStr.split("-").map(Number);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return "";
    const d = new Date(Date.UTC(y, m, 0));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const now = new Date();
  const [bsAsOfDate, setBsAsOfDate] = useState(
    endOfMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  );
  const bsQueryDate = bsAsOfDate;

  // Transaction register extra filters
  const [search, setSearch]       = useState("");
  const [minAmt, setMinAmt]       = useState("");
  const [maxAmt, setMaxAmt]       = useState("");
  const [appliedSearch, setAppliedSearch] = useState({ search: "", minAmount: "", maxAmount: "" });

  const { data: profitLoss, isLoading: plLoading } = useGetProfitLossReport({ startDate: applied.startDate, endDate: applied.endDate });
  const { data: balanceSheet, isLoading: bsLoading } = useGetBalanceSheetReport({ asOfDate: bsQueryDate });
  const { data: cashFlow, isLoading: cfLoading } = useGetCashFlowReport({ startDate: applied.startDate, endDate: applied.endDate });
  const { data: funds = [] } = useGetFunds();

  // GL by Account
  const glByAccountParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) glByAccountParams.set("fundId", fundFilter);
  const { data: glByAccount, isLoading: glLoading } = useFetch<{ accounts: GlAccount[] }>(
    tab === "gl" ? apiUrl(`/api/reports/gl-by-account?${glByAccountParams}`) : null
  );

  // General Journal
  const journalParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) journalParams.set("fundId", fundFilter);
  const { data: journalData, isLoading: journalLoading } = useFetch<{ groups: JournalGroup[]; totalGroups: number }>(
    tab === "journal" ? apiUrl(`/api/reports/general-journal?${journalParams}`) : null
  );

  // Transaction Register
  const regParams = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  if (fundFilter) regParams.set("fundId", fundFilter);
  if (appliedSearch.search)     regParams.set("search", appliedSearch.search);
  if (appliedSearch.minAmount)  regParams.set("minAmount", appliedSearch.minAmount);
  if (appliedSearch.maxAmount)  regParams.set("maxAmount", appliedSearch.maxAmount);
  const { data: registerData, isLoading: regLoading } = useFetch<{ transactions: RegisterTxn[]; total: number }>(
    tab === "register" ? apiUrl(`/api/reports/transaction-register?${regParams}`) : null
  );

  // 990 Preparer
  const prep990Params = new URLSearchParams({ startDate: applied.startDate, endDate: applied.endDate });
  const { data: prep990Data, isLoading: prep990Loading } = useFetch<PreparerData>(
    tab === "prep990" ? apiUrl(`/api/reports/990-preparer?${prep990Params}`) : null
  );

  const handleApply = () => {
    setApplied({ startDate, endDate });
    setAppliedSearch({ search, minAmount: minAmt, maxAmount: maxAmt });
  };

  const handlePreset = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setApplied({ startDate: start, endDate: end });
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const y = today.getFullYear();
  const PRESETS = [
    { label: "This Year",  start: `${y}-01-01`,       end: `${y}-12-31` },
    { label: "Last Year",  start: `${y - 1}-01-01`,   end: `${y - 1}-12-31` },
    { label: "YTD",        start: `${y}-01-01`,       end: todayStr },
    { label: "Q1",         start: `${y}-01-01`,       end: `${y}-03-31` },
    { label: "Q2",         start: `${y}-04-01`,       end: `${y}-06-30` },
    { label: "Q3",         start: `${y}-07-01`,       end: `${y}-09-30` },
    { label: "Q4",         start: `${y}-10-01`,       end: `${y}-12-31` },
  ];

  const handleExportCpa = useCallback(async () => {
    const year = applied.startDate.slice(0, 4);
    const url = apiUrl(`/api/reports/990-export?year=${year}`);
    const token = localStorage.getItem("ml_token");
    const res = await fetch(url, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `990-export-${year}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }, [applied]);

  const chartData = [
    { name: "Revenue",   amount: profitLoss?.totalRevenue  || 0 },
    { name: "Expenses",  amount: profitLoss?.totalExpenses || 0 },
    { name: "Net Income", amount: profitLoss?.netIncome    || 0 },
  ];

  // ── Download helpers ──────────────────────────────────────────────────────
  function triggerCsvDownload(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Shared PDF setup: title block + page numbers
  function makePdf(title: string, subtitle: string) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth();

    const addPageHeader = (pageTitle: string, pageSub: string) => {
      doc.setFillColor(30, 64, 108);
      doc.rect(0, 0, W, 52, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("MissionLedger", 40, 22);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(pageTitle, 40, 37);
      doc.setFontSize(9);
      doc.setTextColor(200, 220, 255);
      doc.text(pageSub, 40, 49);
      doc.setTextColor(0, 0, 0);
    };

    addPageHeader(title, subtitle);

    doc.setFont("helvetica", "normal");
    (doc as any).internal.events.subscribe("addPage", () => {
      addPageHeader(title, subtitle);
    });

    return { doc, startY: 65, W, addPageHeader };
  }

  function addPdfFooter(doc: jsPDF) {
    const pageCount = (doc as any).internal.getNumberOfPages();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, W - 40, H - 20, { align: "right" });
      doc.text(`Generated ${new Date().toLocaleString()}`, 40, H - 20);
    }
    doc.setTextColor(0, 0, 0);
  }

  // Financial Statements → PDF
  const downloadFinancialPdf = useCallback(() => {
    const pl = profitLoss as any;
    const bsData = balanceSheet as any;
    if (!pl && !bsData) return;

    const { doc, startY, W } = makePdf(
      "Financial Statements",
      `Period: ${new Date(applied.startDate).toLocaleDateString()} – ${new Date(applied.endDate).toLocaleDateString()}`
    );

    let y = startY;

    // ── Statement of Activities ─────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 64, 108);
    doc.text("Statement of Activities", 40, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`${new Date(applied.startDate).toLocaleDateString()} – ${new Date(applied.endDate).toLocaleDateString()}`, 40, y + 8);
    doc.setTextColor(0, 0, 0);
    y += 16;

    // Revenue table
    autoTable(doc, {
      startY: y,
      head: [["Account Code", "Account Name", "Amount"]],
      body: [
        ...(pl?.revenue ?? []).map((r: any) => [r.accountCode, r.accountName, formatCurrency(r.amount)]),
        [{ content: "Total Revenue", colSpan: 2, styles: { fontStyle: "bold" } }, { content: formatCurrency(pl?.totalRevenue ?? 0), styles: { fontStyle: "bold", textColor: [6, 95, 70] } }],
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 64, 108], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {},
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Expenses table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 108);
    doc.text("Expenses", 40, y + 6);
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [["Account Code", "Account Name", "Amount"]],
      body: [
        ...(pl?.expenses ?? []).map((r: any) => [r.accountCode, r.accountName, formatCurrency(r.amount)]),
        [{ content: "Total Expenses", colSpan: 2, styles: { fontStyle: "bold" } }, { content: formatCurrency(pl?.totalExpenses ?? 0), styles: { fontStyle: "bold", textColor: [180, 40, 20] } }],
      ],
      theme: "striped",
      headStyles: { fillColor: [100, 40, 40], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // Net Income row
    const ni = pl?.netIncome ?? 0;
    autoTable(doc, {
      startY: y,
      body: [[
        { content: "Change in Net Assets", colSpan: 2, styles: { fontStyle: "bold", fontSize: 10 } },
        { content: formatCurrency(Math.abs(ni)) + (ni < 0 ? " (deficit)" : ""), styles: { fontStyle: "bold", fontSize: 10, textColor: ni >= 0 ? [6, 95, 70] : [180, 40, 20], halign: "right" } },
      ]],
      theme: "plain",
      margin: { left: 40, right: 40 },
    });

    // ── Balance Sheet (new page) ─────────────────────────────────────────────
    doc.addPage();
    y = startY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 64, 108);
    doc.text("Statement of Financial Position", 40, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`As of ${new Date(bsQueryDate).toLocaleDateString()}`, 40, y + 8);
    doc.setTextColor(0, 0, 0);
    y += 16;

    // Assets
    autoTable(doc, {
      startY: y,
      head: [["Account Code", "Account Name", "Balance"]],
      body: [
        ...(bsData?.assets ?? []).map((a: any) => [a.accountCode, a.accountName, formatCurrency(a.amount)]),
        [{ content: "Total Assets", colSpan: 2, styles: { fontStyle: "bold" } }, { content: formatCurrency(bsData?.totalAssets ?? 0), styles: { fontStyle: "bold" } }],
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 64, 108], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Liabilities
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 108);
    doc.text("Liabilities", 40, y + 6);
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [["Account Code", "Account Name", "Balance"]],
      body: [
        ...(bsData?.liabilities ?? []).map((a: any) => [a.accountCode, a.accountName, formatCurrency(a.amount)]),
        [{ content: "Total Liabilities", colSpan: 2, styles: { fontStyle: "bold" } }, { content: formatCurrency(bsData?.totalLiabilities ?? 0), styles: { fontStyle: "bold" } }],
      ],
      theme: "striped",
      headStyles: { fillColor: [80, 80, 80], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Net Assets
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 108);
    doc.text("Net Assets", 40, y + 6);
    y += 14;

    const naRows: any[] = [
      [{ content: "Unrestricted (General & Payroll)", colSpan: 2 }, formatCurrency(bsData?.totalUnrestrictedNetAssets ?? 0)],
      ...(bsData?.restrictedFundDetails ?? []).map((f: any) => [`  ${f.fundName}`, FUND_TYPE_LABELS[f.fundType] ?? f.fundType, formatCurrency(f.netAssets)]),
      [{ content: "Total Net Assets", colSpan: 2, styles: { fontStyle: "bold" } }, { content: formatCurrency(bsData?.totalNetAssets ?? 0), styles: { fontStyle: "bold" } }],
      ...((bsData?.unpostedActivity ?? 0) !== 0 ? [[
        { content: "Uncategorized Transactions (Net)", colSpan: 2, styles: { fontStyle: "italic", textColor: [180, 100, 0] } },
        { content: `${(bsData?.unpostedActivity ?? 0) < 0 ? "(" : ""}${formatCurrency(Math.abs(bsData?.unpostedActivity ?? 0))}${(bsData?.unpostedActivity ?? 0) < 0 ? ")" : ""}`, styles: { fontStyle: "italic", textColor: [180, 100, 0] } }
      ]] : []),
    ];

    autoTable(doc, {
      startY: y,
      head: [["Category", "Fund Type", "Balance"]],
      body: naRows,
      theme: "striped",
      headStyles: { fillColor: [6, 95, 70], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    // Balance check
    const diff = Math.abs(bsData?.difference ?? 0);
    autoTable(doc, {
      startY: y,
      body: [[
        { content: diff <= 0.01 ? "✓ Books are in balance" : `⚠ Out of balance by ${formatCurrency(diff)}`, colSpan: 3,
          styles: { fontStyle: "bold", textColor: diff <= 0.01 ? [6, 95, 70] : [180, 40, 20], halign: "center" } }
      ]],
      theme: "plain",
      margin: { left: 40, right: 40 },
    });

    addPdfFooter(doc);
    doc.save(`financial-statements-${applied.endDate}.pdf`);
  }, [profitLoss, balanceSheet, applied, bsQueryDate]);

  // General Ledger → CSV (one row per GL entry, grouped by account)
  const downloadGl = useCallback(() => {
    const accts = glByAccount?.accounts ?? [];
    if (!accts.length) return;
    const headers = ["Account Code", "Account Name", "Type", "Date", "Description", "Fund", "Debit", "Credit", "Running Balance"];
    const lines: string[] = [];
    for (const acct of accts) {
      // Beginning balance row
      lines.push([
        acct.accountCode, `"${acct.accountName.replace(/"/g, '""')}"`, acct.coaType,
        "", "Beginning Balance", "", "", "", acct.beginBalance.toFixed(2),
      ].join(","));
      for (const e of acct.entries) {
        lines.push([
          acct.accountCode, `"${acct.accountName.replace(/"/g, '""')}"`, acct.coaType,
          new Date(e.date).toLocaleDateString(),
          `"${(e.description ?? "").replace(/"/g, '""')}"`,
          e.fundName ?? "",
          e.entryType === "DEBIT"  ? e.amount.toFixed(2) : "",
          e.entryType === "CREDIT" ? e.amount.toFixed(2) : "",
          e.runningBalance.toFixed(2),
        ].join(","));
      }
      // Ending balance row
      lines.push([
        acct.accountCode, `"${acct.accountName.replace(/"/g, '""')}"`, acct.coaType,
        "", "Ending Balance", "", acct.periodDebit.toFixed(2), acct.periodCredit.toFixed(2), acct.endBalance.toFixed(2),
      ].join(","));
      lines.push(""); // blank separator between accounts
    }
    triggerCsvDownload([headers.join(","), ...lines].join("\n"),
      `general-ledger-${applied.startDate}-${applied.endDate}.csv`);
  }, [glByAccount, applied]);

  // General Journal → CSV (one row per split line, grouped by entry)
  const downloadJournal = useCallback(() => {
    const groups = journalData?.groups ?? [];
    if (!groups.length) return;
    const headers = ["Date", "Type", "Reference", "Entry Description", "Account Code", "Account Name", "Fund", "Debit", "Credit"];
    const lines: string[] = [];
    for (const grp of groups) {
      for (const e of grp.entries) {
        lines.push([
          new Date(grp.date).toLocaleDateString(),
          SOURCE_LABELS[grp.sourceType] ?? grp.sourceType,
          grp.referenceNumber ?? "",
          `"${grp.description.replace(/"/g, '""')}"`,
          e.accountCode,
          `"${e.accountName.replace(/"/g, '""')}"`,
          e.fundName ?? "",
          e.entryType === "DEBIT"  ? e.amount.toFixed(2) : "",
          e.entryType === "CREDIT" ? e.amount.toFixed(2) : "",
        ].join(","));
      }
      lines.push(""); // blank separator between journal entries
    }
    triggerCsvDownload([headers.join(","), ...lines].join("\n"),
      `general-journal-${applied.startDate}-${applied.endDate}.csv`);
  }, [journalData, applied]);

  // Transaction Register → CSV
  const exportCsv = useCallback(() => {
    const rows = registerData?.transactions ?? [];
    if (!rows.length) return;
    const headers = ["Date", "Type", "Description", "Memo", "Check #", "Fund", "Debit Accounts", "Credit Accounts", "Amount"];
    const lines = rows.map(r => [
      new Date(r.date).toLocaleDateString(),
      SOURCE_LABELS[r.sourceType] ?? r.sourceType,
      `"${(r.description ?? "").replace(/"/g, '""')}"`,
      `"${(r.memo ?? "").replace(/"/g, '""')}"`,
      r.checkNumber ?? "",
      r.fundName ?? "",
      `"${(r.debitAccounts ?? "").replace(/"/g, '""')}"`,
      `"${(r.creditAccounts ?? "").replace(/"/g, '""')}"`,
      r.amount.toFixed(2),
    ].join(","));
    triggerCsvDownload([headers.join(","), ...lines].join("\n"),
      `transaction-register-${applied.startDate}-${applied.endDate}.csv`);
  }, [registerData, applied]);

  // General Ledger → PDF
  const downloadGlPdf = useCallback(() => {
    const accts = glByAccount?.accounts ?? [];
    if (!accts.length) return;
    const { doc, startY } = makePdf(
      "General Ledger",
      `${new Date(applied.startDate).toLocaleDateString()} – ${new Date(applied.endDate).toLocaleDateString()}${fundFilter ? "  |  Filtered by fund" : ""}`
    );
    let y = startY;
    for (const acct of accts) {
      // Account section header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setFillColor(230, 236, 248);
      doc.rect(40, y - 2, doc.internal.pageSize.getWidth() - 80, 16, "F");
      doc.setTextColor(30, 64, 108);
      doc.text(`${acct.accountCode}  ${acct.accountName}  (${acct.coaType})`, 44, y + 10);
      doc.setTextColor(0, 0, 0);
      y += 18;

      const rows: any[] = [
        [{ content: "Beginning Balance", styles: { fontStyle: "italic", textColor: [80, 80, 80] } }, "", "", "", "",
         { content: formatCurrency(Math.abs(acct.beginBalance)) + (acct.beginBalance < 0 ? " Cr" : ""), styles: { fontStyle: "italic", textColor: [80, 80, 80], halign: "right" } }],
        ...acct.entries.map(e => [
          new Date(e.date).toLocaleDateString(),
          e.description ?? SOURCE_LABELS[e.sourceType] ?? "—",
          e.fundName ?? "—",
          e.entryType === "DEBIT"  ? formatCurrency(e.amount) : "",
          e.entryType === "CREDIT" ? formatCurrency(e.amount) : "",
          formatCurrency(Math.abs(e.runningBalance)) + (e.runningBalance < 0 ? " Cr" : ""),
        ]),
        [
          { content: "Period Totals", colSpan: 3, styles: { fontStyle: "bold" } },
          { content: formatCurrency(acct.periodDebit),  styles: { fontStyle: "bold", textColor: [160, 60, 20], halign: "right" } },
          { content: formatCurrency(acct.periodCredit), styles: { fontStyle: "bold", textColor: [20, 120, 60], halign: "right" } },
          { content: formatCurrency(Math.abs(acct.endBalance)) + (acct.endBalance < 0 ? " Cr" : ""), styles: { fontStyle: "bold", halign: "right" } },
        ],
      ];

      autoTable(doc, {
        startY: y,
        head: [["Date", "Description", "Fund", "Debit", "Credit", "Balance"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: [30, 64, 108], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
        margin: { left: 40, right: 40 },
      });

      y = (doc as any).lastAutoTable.finalY + 14;
      if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = startY; }
    }
    addPdfFooter(doc);
    doc.save(`general-ledger-${applied.startDate}-${applied.endDate}.pdf`);
  }, [glByAccount, applied, fundFilter]);

  // General Journal → PDF
  const downloadJournalPdf = useCallback(() => {
    const groups = journalData?.groups ?? [];
    if (!groups.length) return;
    const { doc, startY } = makePdf(
      "General Journal",
      `${new Date(applied.startDate).toLocaleDateString()} – ${new Date(applied.endDate).toLocaleDateString()}`
    );
    let y = startY;
    for (const grp of groups) {
      const balanced = Math.abs(grp.totalDebits - grp.totalCredits) <= 0.01;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(240, 240, 250);
      doc.rect(40, y - 2, doc.internal.pageSize.getWidth() - 80, 15, "F");
      doc.setTextColor(30, 64, 108);
      doc.text(
        `${new Date(grp.date).toLocaleDateString()}  |  ${SOURCE_LABELS[grp.sourceType] ?? grp.sourceType}  |  ${grp.description}${grp.referenceNumber ? "  #" + grp.referenceNumber : ""}`,
        44, y + 9
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(balanced ? 20 : 180, balanced ? 120 : 40, balanced ? 60 : 20);
      doc.text(balanced ? "✓ Balanced" : "⚠ Unbalanced", doc.internal.pageSize.getWidth() - 44, y + 9, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += 17;

      autoTable(doc, {
        startY: y,
        head: [["Account Code", "Account Name", "Fund", "Debit", "Credit"]],
        body: [
          ...grp.entries.map(e => [
            e.accountCode, e.accountName, e.fundName ?? "—",
            e.entryType === "DEBIT"  ? formatCurrency(e.amount) : "",
            e.entryType === "CREDIT" ? formatCurrency(e.amount) : "",
          ]),
          [
            { content: "Totals", colSpan: 3, styles: { fontStyle: "bold" } },
            { content: formatCurrency(grp.totalDebits),  styles: { fontStyle: "bold", textColor: [160, 60, 20], halign: "right" } },
            { content: formatCurrency(grp.totalCredits), styles: { fontStyle: "bold", textColor: [20, 120, 60], halign: "right" } },
          ],
        ],
        theme: "striped",
        headStyles: { fillColor: [60, 80, 120], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
        margin: { left: 40, right: 40 },
      });

      y = (doc as any).lastAutoTable.finalY + 12;
      if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = startY; }
    }
    addPdfFooter(doc);
    doc.save(`general-journal-${applied.startDate}-${applied.endDate}.pdf`);
  }, [journalData, applied]);

  // Transaction Register → PDF
  const downloadRegisterPdf = useCallback(() => {
    const rows = registerData?.transactions ?? [];
    if (!rows.length) return;
    const { doc, startY } = makePdf(
      "Transaction Register",
      `${new Date(applied.startDate).toLocaleDateString()} – ${new Date(applied.endDate).toLocaleDateString()}  |  ${rows.length} records`
    );
    const total = rows.reduce((s, r) => s + r.amount, 0);
    autoTable(doc, {
      startY,
      head: [["Date", "Type", "Description / Payee", "Fund", "Debit Accounts", "Amount"]],
      body: [
        ...rows.map(r => [
          new Date(r.date).toLocaleDateString(),
          SOURCE_LABELS[r.sourceType] ?? r.sourceType,
          r.description + (r.memo ? `\n${r.memo}` : ""),
          r.fundName ?? "—",
          r.debitAccounts ?? "—",
          formatCurrency(r.amount),
        ]),
        [
          { content: `Total  (${rows.length} records)`, colSpan: 5, styles: { fontStyle: "bold" } },
          { content: formatCurrency(total), styles: { fontStyle: "bold", halign: "right" } },
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 64, 108], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    addPdfFooter(doc);
    doc.save(`transaction-register-${applied.startDate}-${applied.endDate}.pdf`);
  }, [registerData, applied]);

  // Per-tab download actions
  const handleDownloadPdf = tab === "financial" ? downloadFinancialPdf
    : tab === "gl"      ? downloadGlPdf
    : tab === "journal" ? downloadJournalPdf
    : tab === "prep990" ? (() => {}) as () => void
    : downloadRegisterPdf;

  const handleDownloadCsv = tab === "gl"      ? downloadGl
    : tab === "journal" ? downloadJournal
    : tab === "register" ? exportCsv
    : null;

  const bs = balanceSheet as any;

  return (
    <AppLayout title="Financial Reports">
      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-0 mb-6 border-b border-border overflow-x-auto">
        {([
          { id: "financial", label: "Financial Statements", icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: "gl",        label: "General Ledger",       icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "journal",   label: "General Journal",      icon: <FileText className="w-3.5 h-3.5" /> },
          { id: "register",  label: "Transaction Register", icon: <Table2 className="w-3.5 h-3.5" /> },
          { id: "prep990",   label: "990 Prep",             icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Shared Filter Bar ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-6 bg-card border border-border rounded-xl p-4">
        {tab === "financial" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">Period:</span>
            {PRESETS.map(p => {
              const active = applied.startDate === p.start && applied.endDate === p.end;
              return (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p.start, p.end)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start Date</label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">End Date</label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
        </div>
        {(tab === "gl" || tab === "journal" || tab === "register") && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fund</label>
            <select
              value={fundFilter}
              onChange={e => setFundFilter(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">All Funds</option>
              {(funds as any[]).map((f: any) => (
                <option key={f.id} value={f.id}>{f.name} — {FUND_TYPE_LABELS[f.fundType] ?? "Unrestricted"}</option>
              ))}
            </select>
          </div>
        )}
        {tab === "register" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</label>
              <Input placeholder="Payee, memo, account…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Min $</label>
              <Input type="number" placeholder="0" value={minAmt} onChange={e => setMinAmt(e.target.value)} className="w-24 h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Max $</label>
              <Input type="number" placeholder="Any" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} className="w-24 h-9" />
            </div>
          </>
        )}
        <Button onClick={handleApply} className="h-9">Apply</Button>
        {tab !== "prep990" && (
          <Button variant="outline" onClick={handleDownloadPdf} className="h-9 gap-1.5">
            <FileDown className="w-4 h-4" />Download PDF
          </Button>
        )}
        {handleDownloadCsv && tab !== "prep990" && (
          <Button variant="outline" onClick={handleDownloadCsv} className="h-9 gap-1.5">
            <Download className="w-4 h-4" />Download CSV
          </Button>
        )}
        {tab === "prep990" && (
          <Button variant="outline" onClick={handleExportCpa} className="h-9 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            <Download className="w-4 h-4" />Export for CPA
          </Button>
        )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FINANCIAL STATEMENTS TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "financial" && (
        <>
          {(plLoading || bsLoading || cfLoading) ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading reports…</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card className="bg-gradient-to-br from-card to-emerald-50/30 border-emerald-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 tabular-nums">{formatCurrency(profitLoss?.totalRevenue || 0)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-card to-red-50/30 border-red-100">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive tabular-nums">{formatCurrency(profitLoss?.totalExpenses || 0)}</p>
                  </CardContent>
                </Card>
                <Card className={`bg-gradient-to-br from-card border ${(profitLoss?.netIncome ?? 0) >= 0 ? "to-emerald-50/30 border-emerald-100" : "to-red-50/30 border-red-100"}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">Net Income</span>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${(profitLoss?.netIncome ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(Math.abs(profitLoss?.netIncome || 0))}
                      {(profitLoss?.netIncome ?? 0) < 0 && <span className="text-sm font-normal ml-1">(deficit)</span>}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts + P&L + Balance Sheet side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                {/* Statement of Activities (P&L) */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Statement of Activities</CardTitle>
                    <p className="text-xs text-muted-foreground">{formatDate(profitLoss?.startDate ?? "")} – {formatDate(profitLoss?.endDate ?? "")}</p>
                    <p className="text-[11px] text-muted-foreground/90 leading-snug mt-1.5">
                      Revenue and expenses only for the dates above. Opening balances post to balance sheet accounts (assets, liabilities, equity), not to this activity view — widen the range to include months where you have income or expense, and use the balance sheet as-of date on the right for starting net position.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Revenue */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Revenue</h4>
                      {(profitLoss?.revenue ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No revenue recorded.</p>
                      ) : (profitLoss?.revenue ?? []).map((r: any) => (
                        <div key={r.accountId} className="flex justify-between text-sm py-1 border-b border-border/40">
                          <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
                          <span className="font-medium tabular-nums text-emerald-700">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1.5 mt-1">
                        <span>Total Revenue</span>
                        <span className="text-emerald-700 tabular-nums">{formatCurrency(profitLoss?.totalRevenue || 0)}</span>
                      </div>
                    </div>
                    {/* Expenses */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expenses</h4>
                      {(profitLoss?.expenses ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No expenses recorded.</p>
                      ) : (profitLoss?.expenses ?? []).map((r: any) => (
                        <div key={r.accountId} className="flex justify-between text-sm py-1 border-b border-border/40">
                          <span className="text-muted-foreground">{r.accountCode} {r.accountName}</span>
                          <span className="font-medium tabular-nums text-orange-700">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1.5 mt-1">
                        <span>Total Expenses</span>
                        <span className="text-orange-700 tabular-nums">{formatCurrency(profitLoss?.totalExpenses || 0)}</span>
                      </div>
                    </div>
                    {/* Net */}
                    <div className={`flex justify-between font-bold text-base pt-2 border-t-2 border-border ${(profitLoss?.netIncome ?? 0) >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                      <span>Change in Net Assets</span>
                      <span className="tabular-nums">{formatCurrency(Math.abs(profitLoss?.netIncome || 0))}{(profitLoss?.netIncome ?? 0) < 0 ? " (deficit)" : ""}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Balance Sheet — Statement of Financial Position */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Statement of Financial Position</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">As of {formatDate(bsQueryDate)}</p>
                        <p className="text-[11px] text-muted-foreground/90 leading-snug mt-1">
                          Includes general ledger through this date. Set as-of on or after your opening balance date if totals look too low.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={bsAsOfDate}
                          onChange={e => {
                            if (e.target.value) setBsAsOfDate(e.target.value);
                          }}
                          className="w-36 h-7 text-xs"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {bsLoading ? (
                      <div className="py-6 text-center text-muted-foreground animate-pulse text-sm">Loading…</div>
                    ) : (
                      <div className="space-y-4 text-sm">
                        {/* ASSETS */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assets</h4>
                          {(bs?.assets ?? []).length === 0 ? (
                            <p className="text-muted-foreground text-xs">No asset balances.</p>
                          ) : (bs?.assets ?? []).map((a: any) => (
                            <div key={a.accountId} className="flex justify-between py-0.5 border-b border-border/30">
                              <span className="text-muted-foreground">{a.accountCode} {a.accountName}</span>
                              <span className="tabular-nums font-medium">{formatCurrency(a.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Assets</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalAssets ?? 0)}</span>
                          </div>
                        </div>

                        {/* LIABILITIES */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Liabilities</h4>
                          {(bs?.liabilities ?? []).length === 0 ? (
                            <p className="text-muted-foreground text-xs">No liabilities.</p>
                          ) : (bs?.liabilities ?? []).map((a: any) => (
                            <div key={a.accountId} className="flex justify-between py-0.5 border-b border-border/30">
                              <span className="text-muted-foreground">{a.accountCode} {a.accountName}</span>
                              <span className="tabular-nums font-medium">{formatCurrency(a.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Liabilities</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalLiabilities ?? 0)}</span>
                          </div>
                        </div>

                        {/* NET ASSETS — Unrestricted */}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Net Assets</h4>

                          {/* Unrestricted */}
                          <div className="mb-1">
                            <p className="text-xs font-medium text-emerald-700 mb-0.5">Unrestricted (General &amp; Payroll)</p>
                            <div className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                              <span className="text-muted-foreground">Equity Balances</span>
                              <span className="tabular-nums">{formatCurrency((bs?.totalUnrestrictedNetAssets ?? 0) - (bs?.unrestrictedNetIncome ?? 0))}</span>
                            </div>
                            {(bs?.unrestrictedNetIncome ?? 0) !== 0 && (
                              <div className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                                <span className="text-muted-foreground">Current Period Net Income</span>
                                <span className={`tabular-nums ${(bs?.unrestrictedNetIncome ?? 0) >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                                  {(bs?.unrestrictedNetIncome ?? 0) < 0 ? "(" : ""}{formatCurrency(Math.abs(bs?.unrestrictedNetIncome ?? 0))}{(bs?.unrestrictedNetIncome ?? 0) < 0 ? ")" : ""}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between py-0.5 pl-2 font-medium">
                              <span>Total Unrestricted</span>
                              <span className="tabular-nums">{formatCurrency(bs?.totalUnrestrictedNetAssets ?? 0)}</span>
                            </div>
                          </div>

                          {/* Restricted — per fund */}
                          {(bs?.restrictedFundDetails ?? []).length > 0 && (
                            <div className="mb-1">
                              <p className="text-xs font-medium text-amber-700 mb-0.5">Restricted</p>
                              {(bs?.restrictedFundDetails ?? []).map((f: any) => (
                                <div key={f.fundName} className="flex justify-between py-0.5 border-b border-border/30 pl-2">
                                  <span className="text-muted-foreground">{f.fundName}</span>
                                  <span className="tabular-nums">{formatCurrency(f.netAssets)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between py-0.5 pl-2 font-medium">
                                <span>Total Restricted</span>
                                <span className="tabular-nums">{formatCurrency(bs?.totalRestrictedNetAssets ?? 0)}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between font-semibold pt-1 mt-0.5 border-t border-border">
                            <span>Total Net Assets</span>
                            <span className="tabular-nums">{formatCurrency(bs?.totalNetAssets ?? 0)}</span>
                          </div>

                          {/* Unposted / uncategorized activity reconciling line */}
                          {(bs?.unpostedActivity ?? 0) !== 0 && (
                            <div className="mt-2">
                              <div className="flex justify-between py-0.5 pl-2 text-amber-700">
                                <span className="text-xs italic">Uncategorized Transactions (Net)</span>
                                <span className={`tabular-nums text-xs italic ${(bs?.unpostedActivity ?? 0) >= 0 ? "" : "text-destructive"}`}>
                                  {(bs?.unpostedActivity ?? 0) < 0 ? "(" : ""}{formatCurrency(Math.abs(bs?.unpostedActivity ?? 0))}{(bs?.unpostedActivity ?? 0) < 0 ? ")" : ""}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Total Liabilities + Net Assets */}
                        <div className="flex justify-between font-bold text-base pt-1 border-t-2 border-border">
                          <span>Total Liab. + Net Assets</span>
                          <span className="tabular-nums">{formatCurrency((bs?.totalLiabilities ?? 0) + (bs?.totalNetAssets ?? 0) + (bs?.unpostedActivity ?? 0))}</span>
                        </div>

                        {/* Unposted activity note */}
                        {(bs?.unpostedActivity ?? 0) !== 0 && (
                          <div className="mt-2 p-2 rounded-md text-xs bg-amber-50 border border-amber-200 text-amber-800">
                            ⚠ {Math.round(Math.abs(bs?.unpostedActivity ?? 0) * 100) / 100 > 0 ? formatCurrency(Math.abs(bs?.unpostedActivity ?? 0)) : ""} in bank transactions are imported but not yet categorized. Categorize them in the Bank Register to record income &amp; expenses properly.
                          </div>
                        )}

                        {/* Balance check */}
                        {(bs?.totalAssets ?? 0) > 0 && Math.abs(bs?.difference ?? 0) > 0.01 && (
                          <div className="mt-2 p-2 rounded-md text-xs font-medium bg-red-50 border border-red-200 text-red-700">
                            ⚠ Out of balance by {formatCurrency(Math.abs(bs?.difference ?? 0))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Revenue vs Expenses Chart */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Revenue vs. Expenses</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(v)} />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL LEDGER BY ACCOUNT TAB                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "gl" && (
        <div className="space-y-4">
          {glLoading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading General Ledger…</div>
          ) : (glByAccount?.accounts ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No GL activity for this period.</CardContent></Card>
          ) : (
            (glByAccount?.accounts ?? []).map(acct => (
              <Card key={acct.accountId} className="overflow-hidden">
                {/* Account header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{acct.accountCode}</span>
                    <span className="font-semibold text-sm">{acct.accountName}</span>
                    <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{acct.coaType}</span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${acct.endBalance >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    Balance: {formatCurrency(Math.abs(acct.endBalance))}{acct.endBalance < 0 ? " Cr" : ""}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-left">
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Fund</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Debit</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Credit</th>
                        <th className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {/* Beginning balance row */}
                      <tr className="bg-blue-50/50 text-muted-foreground italic">
                        <td className="px-3 py-1.5 text-xs">—</td>
                        <td className="px-3 py-1.5 text-xs font-medium">Beginning Balance</td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 text-right" />
                        <td className="px-3 py-1.5 text-right" />
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-foreground not-italic">
                          {formatCurrency(Math.abs(acct.beginBalance))}{acct.beginBalance < 0 ? " Cr" : ""}
                        </td>
                      </tr>
                      {acct.entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-center text-xs text-muted-foreground">No activity this period.</td>
                        </tr>
                      ) : acct.entries.map(e => (
                        <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-3 py-1.5 text-xs max-w-[220px] truncate">{e.description || SOURCE_LABELS[e.sourceType] || "—"}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[80px]">{e.fundName || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                            {e.entryType === "DEBIT" ? <span className="text-orange-600 font-medium">{formatCurrency(e.amount)}</span> : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs">
                            {e.entryType === "CREDIT" ? <span className="text-emerald-600 font-medium">{formatCurrency(e.amount)}</span> : ""}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${e.runningBalance >= 0 ? "text-foreground" : "text-destructive"}`}>
                            {formatCurrency(Math.abs(e.runningBalance))}{e.runningBalance < 0 ? " Cr" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Account footer totals */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-semibold text-xs">
                        <td colSpan={3} className="px-3 py-2 text-muted-foreground uppercase tracking-wide">Period Totals</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-600">{formatCurrency(acct.periodDebit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{formatCurrency(acct.periodCredit)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${acct.endBalance >= 0 ? "" : "text-destructive"}`}>
                          {formatCurrency(Math.abs(acct.endBalance))}{acct.endBalance < 0 ? " Cr" : ""}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL JOURNAL TAB                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "journal" && (
        <div className="space-y-3">
          {journalLoading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading General Journal…</div>
          ) : (journalData?.groups ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No journal entries for this period.</CardContent></Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">{journalData?.totalGroups ?? 0} entries</p>
              {(journalData?.groups ?? []).map(grp => (
                <Card key={grp.groupKey} className="overflow-hidden">
                  {/* Entry header */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{formatDate(grp.date)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      grp.sourceType === "TRANSACTION" ? "bg-blue-100 text-blue-800"
                      : grp.sourceType === "OPENING_BALANCE" ? "bg-purple-100 text-purple-800"
                      : "bg-amber-100 text-amber-800"
                    }`}>{SOURCE_LABELS[grp.sourceType] ?? grp.sourceType}</span>
                    <span className="font-semibold text-sm flex-1">{grp.description}</span>
                    {grp.referenceNumber && (
                      <span className="text-xs text-muted-foreground">#{grp.referenceNumber}</span>
                    )}
                    {Math.abs(grp.totalDebits - grp.totalCredits) <= 0.01 ? (
                      <span className="text-xs text-emerald-600 font-medium">✓ Balanced</span>
                    ) : (
                      <span className="text-xs text-destructive font-medium">⚠ Unbalanced</span>
                    )}
                  </div>
                  {/* Splits */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-left">
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Debit</th>
                          <th className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-32">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {grp.entries.map(e => (
                          <tr key={e.id} className="hover:bg-muted/20">
                            <td className="px-4 py-1.5 text-xs">
                              <span className="font-mono text-muted-foreground mr-1.5">{e.accountCode}</span>
                              {e.accountName}
                            </td>
                            <td className="px-4 py-1.5 text-xs text-muted-foreground">{e.fundName || "—"}</td>
                            <td className="px-4 py-1.5 text-xs text-muted-foreground max-w-[160px] truncate">{e.description || "—"}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-xs font-medium">
                              {e.entryType === "DEBIT" ? <span className="text-orange-600">{formatCurrency(e.amount)}</span> : ""}
                            </td>
                            <td className="px-4 py-1.5 text-right tabular-nums text-xs font-medium">
                              {e.entryType === "CREDIT" ? <span className="text-emerald-600">{formatCurrency(e.amount)}</span> : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20 font-semibold text-xs">
                          <td colSpan={3} className="px-4 py-1.5 text-muted-foreground">Totals</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-orange-600">{formatCurrency(grp.totalDebits)}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-emerald-600">{formatCurrency(grp.totalCredits)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TRANSACTION REGISTER TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "register" && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-base">Transaction Register</CardTitle>
            <span className="text-xs text-muted-foreground">{registerData?.total ?? 0} records</span>
          </CardHeader>
          {regLoading ? (
            <CardContent className="py-12 text-center text-muted-foreground animate-pulse">Loading…</CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Type</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description / Payee</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Memo</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fund</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Debit Accounts</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit Accounts</th>
                    <th className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(registerData?.transactions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                        No transactions found. Adjust filters and click Apply.
                      </td>
                    </tr>
                  ) : (registerData?.transactions ?? []).map(txn => (
                    <tr key={txn.groupKey} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(txn.date)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          txn.sourceType === "TRANSACTION" ? "bg-blue-100 text-blue-800"
                          : txn.sourceType === "OPENING_BALANCE" ? "bg-purple-100 text-purple-800"
                          : "bg-amber-100 text-amber-800"
                        }`}>{SOURCE_LABELS[txn.sourceType] ?? txn.sourceType}</span>
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[180px] truncate">{txn.description}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.memo || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[100px] truncate">{txn.fundName || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.debitAccounts || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">{txn.creditAccounts || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(txn.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {(registerData?.transactions ?? []).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-bold text-sm">
                      <td colSpan={7} className="px-3 py-2 text-muted-foreground">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency((registerData?.transactions ?? []).reduce((s, t) => s + t.amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      )}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 990 PREP TAB                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "prep990" && (
        prep990Loading ? (
          <div className="py-12 text-center text-muted-foreground animate-pulse">Loading 990 data…</div>
        ) : !prep990Data ? (
          <div className="py-12 text-center text-muted-foreground">No data. Click Apply to load.</div>
        ) : (
          <div className="space-y-6">

            {/* ── Functional Expense Summary ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Expenses",       value: prep990Data.totals.grandTotal,      color: "text-foreground",    bg: "bg-card" },
                { label: "Program Service",      value: prep990Data.totals.totalProgram,    color: "text-blue-700",      bg: "bg-blue-50/60" },
                { label: "Mgmt & General",       value: prep990Data.totals.totalMgmt,       color: "text-amber-700",     bg: "bg-amber-50/60" },
                { label: "Fundraising",          value: prep990Data.totals.totalFundraising, color: "text-purple-700",   bg: "bg-purple-50/60" },
              ].map(s => (
                <Card key={s.label} className={`${s.bg} border border-border`}>
                  <CardContent className="p-5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{s.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${s.color}`}>{formatCurrency(s.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Public Support Test ────────────────────────────────────────── */}
            {(() => {
              const pst = prep990Data.publicSupportTest;
              const passes = pst.passes;
              return (
                <Card className={`border ${passes ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {passes
                        ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                        : <AlertTriangle className="w-5 h-5 text-red-500" />}
                      Public Support Test (IRS 501(c)(3))
                      <span className={`ml-auto text-sm font-semibold px-2.5 py-0.5 rounded-full ${passes ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {passes ? "PASS" : "FAIL"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-6 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Total Revenue:</span>{" "}
                        <span className="font-semibold">{formatCurrency(pst.totalRevenue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Public Support:</span>{" "}
                        <span className="font-semibold">{formatCurrency(pst.totalPublicSupport)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Support %:</span>{" "}
                        <span className={`font-bold ${passes ? "text-emerald-700" : "text-red-600"}`}>{pst.publicSupportPct.toFixed(1)}%</span>
                        <span className="text-muted-foreground ml-1">(threshold: {pst.threshold}%)</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2.5 rounded-full bg-gray-200 mb-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${passes ? "bg-emerald-500" : "bg-red-400"}`}
                        style={{ width: `${Math.min(100, pst.publicSupportPct)}%` }}
                      />
                    </div>
                    {pst.publicSupportAccounts.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Qualifying Support Accounts</p>
                        <div className="flex flex-wrap gap-2">
                          {pst.publicSupportAccounts.map(a => (
                            <span key={a.code} className="text-xs bg-white border border-emerald-200 rounded px-2 py-0.5">
                              {a.code} {a.name} — {formatCurrency(a.amount)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── IRS Line Groups Table ──────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">IRS Form 990 — Expense Line Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 text-left w-[220px]">IRS Line</th>
                        <th className="px-4 py-3 text-right">Program Service</th>
                        <th className="px-4 py-3 text-right">Mgmt & General</th>
                        <th className="px-4 py-3 text-right">Fundraising</th>
                        <th className="px-4 py-3 text-right text-amber-700">Untagged</th>
                        <th className="px-4 py-3 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {prep990Data.irsLines.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No expense data for this period.</td></tr>
                      ) : prep990Data.irsLines.map(line => (
                        <tr key={line.line} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-[hsl(210,60%,25%)]">{line.line}</p>
                            <p className="text-xs text-muted-foreground">{line.label}</p>
                            {line.accounts.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {line.accounts.map(a => (
                                  <span key={a.code} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                    {a.code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{line.programService > 0 ? formatCurrency(line.programService) : "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{line.managementGeneral > 0 ? formatCurrency(line.managementGeneral) : "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-purple-700">{line.fundraising > 0 ? formatCurrency(line.fundraising) : "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{line.untagged > 0 ? formatCurrency(line.untagged) : "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCurrency(line.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-bold text-sm">
                        <td className="px-4 py-2.5 text-muted-foreground">Grand Total</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{formatCurrency(prep990Data.totals.totalProgram)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">{formatCurrency(prep990Data.totals.totalMgmt)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-purple-700">{formatCurrency(prep990Data.totals.totalFundraising)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-600" />
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(prep990Data.totals.grandTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

          </div>
        )
      )}
    </AppLayout>
  );
}
