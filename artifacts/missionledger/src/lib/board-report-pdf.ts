import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  formatCurrency,
  buildHighlights,
  buildNarrative,
  revenueSpendingSummary,
  positionSummary,
  healthSummary,
  fundBalancesSummary,
  type Highlight,
} from "./board-report-copy";

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
  fundBalances: {
    asOfDate: string;
    total: number;
    items: Array<{ fundId: string; fundName: string; fundType: string; balance: number }>;
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
    cashAsOfDate: string;
    bankAccounts: Array<{ id: string; name: string; lastFour: string | null; balance: number }>;
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

const FUND_TYPE_LABELS: Record<string, string> = {
  UNRESTRICTED: "Unrestricted",
  RESTRICTED_TEMP: "Temp. Restricted",
  RESTRICTED_PERM: "Perm. Restricted",
  BOARD_DESIGNATED: "Board Designated",
};

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
}

const TONE_RGB: Record<Highlight["tone"], [number, number, number]> = {
  positive: [5, 150, 105],
  warning: [180, 83, 9],
  danger: [185, 28, 28],
  neutral: [71, 85, 105],
};

const CONTENT_W = 612 - MARGIN * 2; // US Letter width minus margins

/** Section heading plus an optional factual "What this means" line. */
function sectionTitleWithSummary(doc: jsPDF, title: string, y: number, summary?: string): number {
  y = sectionTitle(doc, title, y);
  if (summary) {
    const lines = doc.splitTextToSize(`What this means: ${summary}`, CONTENT_W) as string[];
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(lines, MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    y += lines.length * 11 + 6;
  }
  return y;
}

/** Draw a simple horizontal bar chart. Returns the y position after the chart. */
function drawBarChart(
  doc: jsPDF,
  y: number,
  rows: Array<{ label: string; value: number; color: [number, number, number] }>,
  options?: { max?: number },
): number {
  const labelW = 190;
  const valueW = 90;
  const barW = CONTENT_W - labelW - valueW - 8;
  const rowH = 16;
  const max = options?.max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  for (const r of rows) {
    const barLen = max > 0 ? Math.max((Math.abs(r.value) / max) * barW, 2) : 0;
    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(doc.splitTextToSize(r.label, labelW - 6)[0], MARGIN, y + 8);
    // Bar
    doc.setFillColor(235, 235, 235);
    doc.rect(MARGIN + labelW, y + 1, barW, 9, "F");
    doc.setFillColor(...r.color);
    doc.rect(MARGIN + labelW, y + 1, barLen, 9, "F");
    // Value
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(8);
    doc.text(formatCurrency(r.value), MARGIN + labelW + barW + 8, y + 8);
    y += rowH;
  }
  doc.setTextColor(0, 0, 0);
  return y;
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

  const highlights = buildHighlights({
    totalCash: data.financialHealth.totalCash,
    netIncome: data.profitLoss.netIncome,
    monthsOfRunway: data.financialHealth.monthsOfRunway,
    budget: { percent: data.financialHealth.budget.percent },
    metrics: {
      total: data.programmaticImpact.metrics.length,
      onTrack: data.programmaticImpact.metrics.filter((m) => m.percentOfTarget >= 100).length,
      atRisk: data.programmaticImpact.metrics.filter((m) => m.percentOfTarget > 0 && m.percentOfTarget < 80).length,
    },
    risks: {
      red: data.strategicRisks.items.filter((r) => r.status === "RED").length,
      yellow: data.strategicRisks.items.filter((r) => r.status === "YELLOW").length,
    },
  });

  const narrative = buildNarrative({
    label: data.dateRange.label,
    totalRevenue: data.profitLoss.totalRevenue,
    totalExpenses: data.profitLoss.totalExpenses,
    netIncome: data.profitLoss.netIncome,
    totalCash: data.financialHealth.totalCash,
    monthsOfRunway: data.financialHealth.monthsOfRunway,
    metrics: {
      total: data.programmaticImpact.metrics.length,
      onTrack: data.programmaticImpact.metrics.filter((m) => m.percentOfTarget >= 100).length,
    },
    risks: {
      red: data.strategicRisks.items.filter((r) => r.status === "RED").length,
      yellow: data.strategicRisks.items.filter((r) => r.status === "YELLOW").length,
    },
  });

  let y = 68;

  // ── In a Nutshell (executive summary) ───────────────────────────────────────
  y = sectionTitle(doc, "In a Nutshell", y);
  const narrativeLines = doc.splitTextToSize(narrative, CONTENT_W) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(narrativeLines, MARGIN, y);
  doc.setTextColor(0, 0, 0);
  y += narrativeLines.length * 11 + 8;

  const tileW = (CONTENT_W - 2 * 8) / 3;
  const tileH = 46;
  highlights.forEach((h, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const tx = MARGIN + col * (tileW + 8);
    const ty = y + row * (tileH + 8);
    doc.setDrawColor(225, 225, 225);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(tx, ty, tileW, tileH, 3, 3, "FD");
    const tone = TONE_RGB[h.tone];
    doc.setFillColor(...tone);
    doc.circle(tx + 9, ty + 12, 2.2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(doc.splitTextToSize(h.label, tileW - 20)[0], tx + 15, ty + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(h.value, tx + 9, ty + 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(doc.splitTextToSize(h.gloss, tileW - 18)[0], tx + 9, ty + 40);
  });
  y += Math.ceil(highlights.length / 3) * (tileH + 8) + 10;
  doc.setTextColor(0, 0, 0);

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

  // ── Revenue & Spending (was: Statement of Activities) ───────────────────────
  y = sectionTitleWithSummary(
    doc,
    "Revenue & Spending",
    y,
    revenueSpendingSummary({
      totalRevenue: data.profitLoss.totalRevenue,
      totalExpenses: data.profitLoss.totalExpenses,
      netIncome: data.profitLoss.netIncome,
    }),
  );
  autoTable(doc, {
    startY: y,
    head: [["", "Amount"]],
    body: [
      ["Total Revenue", formatCurrency(data.profitLoss.totalRevenue)],
      ["Total Expenses", formatCurrency(data.profitLoss.totalExpenses)],
      [{ content: data.profitLoss.netIncome >= 0 ? "Surplus" : "Deficit", styles: { fontStyle: "bold" } }, { content: formatCurrency(data.profitLoss.netIncome), styles: { fontStyle: "bold" } }],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastTableY(doc) + 10;
  y = drawBarChart(doc, y, [
    { label: "Revenue", value: data.profitLoss.totalRevenue, color: [5, 150, 105] },
    { label: "Expenses", value: data.profitLoss.totalExpenses, color: [220, 38, 38] },
    { label: "Net", value: data.profitLoss.netIncome, color: [37, 99, 235] },
  ]);
  y += 8;
  if (data.profitLoss.topRevenue.length > 0 || data.profitLoss.topExpenses.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Where our money came from", "Amount", "Where our money went", "Amount"]],
      body: Array.from({ length: Math.max(data.profitLoss.topRevenue.length, data.profitLoss.topExpenses.length, 1) }).map((_, i) => {
        const rev = data.profitLoss.topRevenue[i];
        const exp = data.profitLoss.topExpenses[i];
        return [
          rev ? `${rev.accountName} (${rev.accountCode})` : "",
          rev ? formatCurrency(rev.amount) : "",
          exp ? `${exp.accountName} (${exp.accountCode})` : "",
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

  // ── What We Own & Owe (was: Statement of Financial Position) ─────────────────
  y = sectionTitleWithSummary(
    doc,
    `What We Own & Owe — As of ${data.balanceSheet.asOfDate}`,
    y,
    positionSummary({
      totalAssets: data.balanceSheet.totalAssets,
      totalLiabilities: data.balanceSheet.totalLiabilities,
      totalNetAssets: data.balanceSheet.totalNetAssets,
    }),
  );
  autoTable(doc, {
    startY: y,
    head: [["", "Amount"]],
    body: [
      ["Total Assets", formatCurrency(data.balanceSheet.totalAssets)],
      ["Total Liabilities", formatCurrency(data.balanceSheet.totalLiabilities)],
      ["Net Assets", formatCurrency(data.balanceSheet.totalNetAssets)],
      ["Available to spend (Unrestricted)", formatCurrency(data.balanceSheet.totalUnrestrictedNetAssets)],
      ["Restricted by donors", formatCurrency(data.balanceSheet.totalRestrictedNetAssets)],
    ],
    theme: "striped",
    headStyles: { fillColor: NAVY, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastTableY(doc) + 18;

  // ── Fund Balances ───────────────────────────────────────────────────────────
  y = sectionTitleWithSummary(
    doc,
    `Fund Balances — As of ${data.fundBalances.asOfDate}`,
    y,
    fundBalancesSummary(data.fundBalances.total, data.fundBalances.items.length),
  );
  if (data.fundBalances.items.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("No funds configured.", MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 20;
  } else {
    y = drawBarChart(
      doc,
      y,
      data.fundBalances.items.map((f) => ({
        label: `${f.fundName} (${FUND_TYPE_LABELS[f.fundType] ?? f.fundType})`,
        value: f.balance,
        color: f.balance < 0 ? [220, 38, 38] : ([30, 64, 108] as [number, number, number]),
      })),
    );
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Fund", "Type", "Balance"]],
      body: [
        ...data.fundBalances.items.map((f) => [
          f.fundName,
          FUND_TYPE_LABELS[f.fundType] ?? f.fundType,
          formatCurrency(f.balance),
        ]),
        [
          { content: "Total across funds", styles: { fontStyle: "bold" } },
          "",
          { content: formatCurrency(data.fundBalances.total), styles: { fontStyle: "bold" } },
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastTableY(doc) + 18;
  }

  // ── Cash & Sustainability (was: Financial Health) ────────────────────────────
  y = sectionTitleWithSummary(
    doc,
    "Cash & Sustainability",
    y,
    healthSummary({
      totalCash: data.financialHealth.totalCash,
      monthsOfRunway: data.financialHealth.monthsOfRunway,
      budget: { percent: data.financialHealth.budget.percent },
    }),
  );

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Cash from bank register as of ${data.financialHealth.cashAsOfDate}.`,
    MARGIN,
    y,
  );
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Amount"]],
    body: [
      ["Cash on hand", formatCurrency(data.financialHealth.totalCash)],
      ["Revenue this period", formatCurrency(data.financialHealth.periodRevenue)],
      ["Spending this period", formatCurrency(data.financialHealth.periodExpenses)],
      ["Net this period", formatCurrency(data.financialHealth.periodNet)],
      ["Avg. monthly spending", `${formatCurrency(data.financialHealth.periodBurnRate)}/mo`],
      [
        "Months of runway",
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

  if (data.financialHealth.bankAccounts.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Bank Account", "Balance"]],
      body: [
        ...data.financialHealth.bankAccounts.map((b) => [
          b.lastFour ? `${b.name} ••${b.lastFour}` : b.name,
          formatCurrency(b.balance),
        ]),
        ["Total cash", formatCurrency(data.financialHealth.totalCash)],
      ],
      theme: "striped",
      headStyles: { fillColor: NAVY, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastTableY(doc) + 10;
  }

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

  // ── Program Goals & Impact ────────────────────────────────────────────────
  const goalsOnTrack = data.programmaticImpact.metrics.filter((m) => m.percentOfTarget >= 100).length;
  const goalsTotal = data.programmaticImpact.metrics.length;
  y = sectionTitleWithSummary(
    doc,
    `Program Goals & Impact — ${data.period.label}`,
    y,
    goalsTotal > 0 ? `${goalsOnTrack} of ${goalsTotal} program goals are on track this period.` : undefined,
  );

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

  // ── Strategic Risks ─────────────────────────────────────────────────────────
  y = sectionTitle(doc, "Strategic Risks", y);

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
    y = lastTableY(doc) + 18;
  }

  // ── Glossary ────────────────────────────────────────────────────────────────
  // Advance from the tracked `y` (updated above whether or not the committee
  // table rendered). Recomputing from lastTableY() here would jump back to a
  // stale earlier table and overlap the previous section's heading.
  y += 18;
  y = sectionTitle(doc, "Terms Used in This Report", y);
  const glossary: Array<[string, string]> = [
    ["Revenue", "Money the organization received."],
    ["Expenses", "Money the organization spent."],
    ["Surplus / (Deficit)", "What's left when expenses are subtracted from revenue. A surplus is positive; a deficit is negative."],
    ["Net Assets", "Everything the organization owns minus everything it owes. Also called \"fund balance\" or \"equity\"."],
    ["Available to spend", "Net assets not restricted by donors (\"unrestricted\")."],
    ["Restricted", "Net assets a donor designated for a specific purpose."],
    ["Months of runway", "How long cash would last at the current rate of spending."],
    ["Budget used", "Share of the active annual budget spent so far."],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Term", "Meaning"]],
    body: glossary,
    theme: "grid",
    headStyles: { fillColor: NAVY, fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 130, fontStyle: "bold" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  addPdfFooters(doc);

  const safeOrg = (orgName || "organization").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const filename = `board-report-${safeOrg}-${format(generated, "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}
