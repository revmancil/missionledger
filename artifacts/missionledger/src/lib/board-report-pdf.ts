import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

type RiskStatus = "GREEN" | "YELLOW" | "RED";
type CommitteeType = "FINANCE" | "AUDIT" | "GOVERNANCE" | "EXECUTIVE" | "PROGRAM" | "OTHER";

export interface BoardReportPdfData {
  generatedAt: string;
  dateRange: { label: string; startDate: string; endDate: string };
  period: { year: number; quarter: number; label: string };
  profitLoss: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    topRevenue: Array<{ accountCode: string; accountName: string; amount: number }>;
    topExpenses: Array<{ accountCode: string; accountName: string; amount: number }>;
  };
  balanceSheet: {
    asOfDate: string;
    totalAssets: number;
    totalLiabilities: number;
    totalNetAssets: number;
    totalUnrestrictedNetAssets: number;
    totalRestrictedNetAssets: number;
    topAssets: Array<{ accountCode: string; accountName: string; amount: number }>;
    topLiabilities: Array<{ accountCode: string; accountName: string; amount: number }>;
  };
  actionRequired: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    category: "financial" | "risk" | "program";
  }>;
  financialHealth: {
    totalCash: number;
    periodRevenue: number;
    periodExpenses: number;
    periodNet: number;
    periodBurnRate: number;
    monthsOfRunway: number | null;
    budget: { total: number; actual: number; percent: number; remaining: number };
  };
  programmaticImpact: {
    metrics: Array<{
      name: string;
      description: string | null;
      targetValue: number;
      actualValue: number;
      unit: string | null;
      percentOfTarget: number;
    }>;
  };
  strategicRisks: {
    items: Array<{
      title: string;
      description: string | null;
      status: RiskStatus;
      ownerName: string | null;
      reviewDate: string | null;
      mitigation: string | null;
    }>;
  };
  committeeUpdates: Array<{
    committeeType: CommitteeType;
    title: string;
    body: string;
    meetingDate: string | null;
    authorName: string;
    isPublished: boolean;
  }>;
}

const NAVY: [number, number, number] = [30, 64, 108];
const MARGIN = 40;

const COMMITTEE_LABELS: Record<CommitteeType, string> = {
  FINANCE: "Finance",
  AUDIT: "Audit",
  GOVERNANCE: "Governance",
  EXECUTIVE: "Executive",
  PROGRAM: "Program",
  OTHER: "Other",
};

const RISK_LABELS: Record<RiskStatus, string> = {
  GREEN: "On Track",
  YELLOW: "Watch",
  RED: "Action Needed",
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
}

function addPageHeader(
  doc: jsPDF,
  orgName: string,
  reportTitle: string,
  subtitle: string,
) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 52, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(orgName, MARGIN, 20);
  doc.setFontSize(12);
  doc.text(reportTitle, MARGIN, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 255);
  doc.text(subtitle, MARGIN, 48);
  doc.setTextColor(0, 0, 0);
}

function addPdfFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const stamp = format(new Date(), "MMMM d, yyyy h:mm a");
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generated ${stamp}`, MARGIN, H - 18);
    doc.text(`Page ${i} of ${pageCount}`, W - MARGIN, H - 18, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  return y + 16;
}

export function downloadBoardReportPdf(
  data: BoardReportPdfData,
  orgName: string,
  options?: { adminView?: boolean },
) {
  const generated = parseISO(data.generatedAt);
  const monthYear = format(generated, "MMMM yyyy");
  const reportTitle = `Board Member Report: ${monthYear}`;
  const viewNote = options?.adminView ? " · Admin view" : " · Board view";
  const subtitle = `${data.dateRange.label} (${data.dateRange.startDate} – ${data.dateRange.endDate})${viewNote}`;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();

  addPageHeader(doc, orgName, reportTitle, subtitle);
  (doc as unknown as { internal: { events: { subscribe: (e: string, fn: () => void) => void } } }).internal.events.subscribe(
    "addPage",
    () => addPageHeader(doc, orgName, reportTitle, subtitle),
  );

  let y = 68;

  // ── Action Required (prominent) ─────────────────────────────────────────────
  doc.setFillColor(255, 247, 230);
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, y - 4, W - MARGIN * 2, 22, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(146, 64, 14);
  doc.text("Action Required", MARGIN + 10, y + 10);
  doc.setTextColor(0, 0, 0);
  y += 28;

  if (data.actionRequired.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("No urgent board actions at this time.", MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 20;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Priority", "Action Item", "Details"]],
      body: data.actionRequired.map((item) => [
        item.severity.toUpperCase(),
        item.title,
        item.description,
      ]),
      theme: "grid",
      headStyles: { fillColor: [180, 83, 9], fontSize: 9, fontStyle: "bold" },
      bodyStyles: { fontSize: 9, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: "bold" },
        1: { cellWidth: 140 },
        2: { cellWidth: "auto" },
      },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: (hook) => {
        if (hook.section !== "body" || hook.column.index !== 0) return;
        const sev = String(hook.cell.raw ?? "").toLowerCase();
        if (sev === "high") hook.cell.styles.textColor = [185, 28, 28];
        else if (sev === "medium") hook.cell.styles.textColor = [180, 83, 9];
      },
    });
    y = lastTableY(doc) + 18;
  }

  // ── Statement of Activities (Summary) ───────────────────────────────────────
  y = sectionTitle(doc, "Statement of Activities (Summary)", y);
  autoTable(doc, {
    startY: y,
    head: [["", "Amount"]],
    body: [
      ["Total Revenue", formatCurrency(data.profitLoss.totalRevenue)],
      ["Total Expenses", formatCurrency(data.profitLoss.totalExpenses)],
      [{ content: "Net Income", styles: { fontStyle: "bold" } }, { content: formatCurrency(data.profitLoss.netIncome), styles: { fontStyle: "bold" } }],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastTableY(doc) + 8;
  if (data.profitLoss.topRevenue.length > 0 || data.profitLoss.topExpenses.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Top Revenue Accounts", "Amount", "Top Expense Accounts", "Amount"]],
      body: Array.from({ length: Math.max(data.profitLoss.topRevenue.length, data.profitLoss.topExpenses.length, 1) }).map((_, i) => {
        const rev = data.profitLoss.topRevenue[i];
        const exp = data.profitLoss.topExpenses[i];
        return [
          rev ? `${rev.accountCode} ${rev.accountName}` : "",
          rev ? formatCurrency(rev.amount) : "",
          exp ? `${exp.accountCode} ${exp.accountName}` : "",
          exp ? formatCurrency(exp.amount) : "",
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastTableY(doc) + 18;
  }

  // ── Balance Sheet (Summary) ───────────────────────────────────────────────
  y = sectionTitle(doc, `Statement of Financial Position — As of ${data.balanceSheet.asOfDate}`, y);
  autoTable(doc, {
    startY: y,
    head: [["", "Amount"]],
    body: [
      ["Total Assets", formatCurrency(data.balanceSheet.totalAssets)],
      ["Total Liabilities", formatCurrency(data.balanceSheet.totalLiabilities)],
      ["Total Net Assets", formatCurrency(data.balanceSheet.totalNetAssets)],
      ["Unrestricted Net Assets", formatCurrency(data.balanceSheet.totalUnrestrictedNetAssets)],
      ["Restricted Net Assets", formatCurrency(data.balanceSheet.totalRestrictedNetAssets)],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastTableY(doc) + 18;

  // ── Financial Health ────────────────────────────────────────────────────────
  y = sectionTitle(doc, "Financial Health", y);

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Amount"]],
    body: [
      ["Cash Position", formatCurrency(data.financialHealth.totalCash)],
      ["Period Revenue", formatCurrency(data.financialHealth.periodRevenue)],
      ["Period Expenses", formatCurrency(data.financialHealth.periodExpenses)],
      ["Period Net", formatCurrency(data.financialHealth.periodNet)],
      ["Monthly Burn Rate (avg.)", `${formatCurrency(data.financialHealth.periodBurnRate)}/mo`],
      [
        "Estimated Cash Runway",
        data.financialHealth.monthsOfRunway != null
          ? `${data.financialHealth.monthsOfRunway} months`
          : "—",
      ],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = lastTableY(doc) + 10;

  autoTable(doc, {
    startY: y,
    head: [["Budget Summary", "Amount"]],
    body: [
      ["Annual Budget (active)", formatCurrency(data.financialHealth.budget.total)],
      ["Spent to Date", formatCurrency(data.financialHealth.budget.actual)],
      ["Remaining", formatCurrency(data.financialHealth.budget.remaining)],
      ["Percent Used", `${data.financialHealth.budget.percent}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  y = lastTableY(doc) + 18;

  // ── Programmatic Impact ───────────────────────────────────────────────────
  y = sectionTitle(doc, `Programmatic Impact — ${data.period.label}`, y);

  if (data.programmaticImpact.metrics.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No mission metrics recorded for this quarter.", MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 18;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Metric", "Actual", "Target", "Unit", "% of Target"]],
      body: data.programmaticImpact.metrics.map((m) => [
        m.name,
        m.actualValue.toLocaleString(),
        m.targetValue.toLocaleString(),
        m.unit ?? "—",
        `${m.percentOfTarget}%`,
      ]),
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastTableY(doc) + 18;
  }

  // ── Strategic Risk ──────────────────────────────────────────────────────────
  y = sectionTitle(doc, "Strategic Risk Register", y);

  if (data.strategicRisks.items.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No strategic risks on the register.", MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 18;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Status", "Risk", "Owner", "Review Date", "Mitigation"]],
      body: data.strategicRisks.items.map((r) => [
        RISK_LABELS[r.status],
        [r.title, r.description].filter(Boolean).join(" — "),
        r.ownerName ?? "—",
        r.reviewDate ? format(parseISO(r.reviewDate), "MMM d, yyyy") : "—",
        r.mitigation ?? "—",
      ]),
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 130 },
      },
      margin: { left: MARGIN, right: MARGIN },
      didParseCell: (hook) => {
        if (hook.section !== "body" || hook.column.index !== 0) return;
        const label = String(hook.cell.raw ?? "");
        if (label === "Action Needed") hook.cell.styles.textColor = [185, 28, 28];
        else if (label === "Watch") hook.cell.styles.textColor = [180, 83, 9];
        else if (label === "On Track") hook.cell.styles.textColor = [5, 150, 105];
      },
    });
    y = lastTableY(doc) + 18;
  }

  // ── Committee Updates ───────────────────────────────────────────────────────
  y = sectionTitle(doc, "Committee Updates", y);

  if (data.committeeUpdates.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("No committee updates for this reporting period.", MARGIN, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Committee", "Title", "Date", "Author", "Summary"]],
      body: data.committeeUpdates.map((u) => [
        COMMITTEE_LABELS[u.committeeType],
        u.title + (options?.adminView && !u.isPublished ? " (Draft)" : ""),
        u.meetingDate ? format(parseISO(u.meetingDate), "MMM d, yyyy") : "—",
        u.authorName,
        u.body.length > 200 ? `${u.body.slice(0, 197)}…` : u.body,
      ]),
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 8, valign: "top" },
      margin: { left: MARGIN, right: MARGIN },
    });
  }

  addPdfFooters(doc);

  const safeOrg = (orgName || "organization").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const filename = `board-report-${safeOrg}-${format(generated, "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}
