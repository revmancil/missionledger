/**
 * Content layer for the MissionLedger marketing-site redesign prototype.
 *
 * Everything the pages render lives here so copy can be reviewed and edited
 * without touching layout code.
 */
import {
  Layers,
  Users,
  FileText,
  Landmark,
  CalendarCheck,
  BookOpen,
  ShieldCheck,
  BarChart3,
  HeartHandshake,
  Repeat,
  Building2,
  Church,
  type LucideIcon,
} from "lucide-react";

export type RouteId =
  | "home"
  | "features"
  | "pricing"
  | "about"
  | "security"
  | "compare";

export const NAV: { id: RouteId; label: string }[] = [
  { id: "features", label: "Features" },
  { id: "pricing", label: "Pricing" },
  { id: "compare", label: "Compare" },
  { id: "security", label: "Security" },
  { id: "about", label: "About" },
];

export const ROUTES: Record<RouteId, { label: string }> = {
  home: { label: "Home" },
  features: { label: "Features" },
  pricing: { label: "Pricing" },
  about: { label: "About" },
  security: { label: "Security" },
  compare: { label: "Compare to QuickBooks" },
};

export interface OrgType {
  id: string;
  icon: LucideIcon;
  label: string;
  tag: string;
  body: string;
  bullets: string[];
}

export const ORG_TYPES: OrgType[] = [
  {
    id: "nonprofit",
    icon: Building2,
    label: "Nonprofits",
    tag: "501(c)(3)",
    body: "Fund accounting, grant tracking, functional expense reporting, and 990 preparation — built for exempt organizations and their auditors.",
    bullets: [
      "Restricted vs. unrestricted net assets",
      "Grant & program fund tracking",
      "Functional expense allocation",
      "990 supporting schedules & export",
    ],
  },
  {
    id: "church",
    icon: Church,
    label: "Churches",
    tag: "Tithes & offerings",
    body: "Purpose-built for congregational finance — tithe and offering tracking, designated giving, and board-ready reporting for church leadership.",
    bullets: [
      "Tithes, offerings & designated gifts",
      "Contribution statements for givers",
      "Benevolence & mission fund tracking",
      "Clergy housing allowance reporting",
    ],
  },
  {
    id: "membership",
    icon: HeartHandshake,
    label: "Associations",
    tag: "501(c)(7)",
    body: "Dues, chapters, and events kept in balance — with clear reporting so member-nonprofit boards understand where the money went.",
    bullets: [
      "Membership dues & deferred revenue",
      "Chapter / region fund tracking",
      "Event income & expense reporting",
      "Board-facing financial packets",
    ],
  },
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  group: "Accounting" | "Giving" | "Close & Controls";
}

export const FEATURES: Feature[] = [
  {
    icon: Layers,
    title: "True fund accounting",
    body: "Track restricted and unrestricted funds side by side. Every donation, expense, and transfer stays attributed to the right fund, with balances that update in real time.",
    group: "Accounting",
  },
  {
    icon: Landmark,
    title: "Bank reconciliation",
    body: "Connected bank feeds plus a two-column cleared/uncleared workspace and live math so month-end actually closes on time.",
    group: "Close & Controls",
  },
  {
    icon: CalendarCheck,
    title: "Guided period close",
    body: "A structured close workflow with a pre-close health check, period soft-lock, year-end roll-forward, and a permanent reopen audit trail.",
    group: "Close & Controls",
  },
  {
    icon: BookOpen,
    title: "Opening balances wizard",
    body: "GAAP-compliant, double-entry onboarding. Import a prefilled CSV or enter balances by hand, with a live accounting-equation panel to prove it balances.",
    group: "Accounting",
  },
  {
    icon: Users,
    title: "Donor & giver CRM",
    body: "Donation records, pledges, recurring gifts, and giving history live next to the ledger entries they create — no separate spreadsheet to reconcile.",
    group: "Giving",
  },
  {
    icon: FileText,
    title: "Giving statements & 990 prep",
    body: "Generate year-end contribution statements givers can trust, and map your chart of accounts to Form 990 lines for a calmer tax season.",
    group: "Giving",
  },
  {
    icon: Repeat,
    title: "Pledges & campaigns",
    body: "Track multi-year pledges and capital campaigns with fulfillment status, so leadership knows what is promised versus what has actually arrived.",
    group: "Giving",
  },
  {
    icon: BarChart3,
    title: "Board-ready reporting",
    body: "Statement of Activities, Statement of Financial Position, General Ledger, Trial Balance, and one-click board packets your leadership can read.",
    group: "Accounting",
  },
  {
    icon: ShieldCheck,
    title: "Audit-ready controls",
    body: "Immutable audit logs, role-based access, and period locks strengthen oversight and shorten the questions your auditor has to ask.",
    group: "Close & Controls",
  },
];

export const FEATURE_GROUPS: Feature["group"][] = [
  "Accounting",
  "Giving",
  "Close & Controls",
];

export interface Plan {
  name: string;
  price: string;
  period: string;
  blurb: string;
  popular?: boolean;
  features: string[];
  cta: string;
}

export const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "$19",
    period: "/mo",
    blurb: "For small organizations getting off spreadsheets.",
    features: [
      "1 bank account",
      "Up to 500 transactions / month",
      "Fund accounting & standard reports",
      "Donor & giver records",
      "Giving statements",
      "Opening balances wizard",
      "Email support",
    ],
    cta: "Start free trial",
  },
  {
    name: "Professional",
    price: "$49",
    period: "/mo",
    blurb: "For growing nonprofits and churches with real fund activity.",
    popular: true,
    features: [
      "5 bank accounts",
      "Unlimited transactions",
      "Advanced reports & analytics",
      "Bank reconciliation",
      "Period close tool",
      "990 reporting tool",
      "Pledges & campaigns",
      "Multi-user access",
      "Priority support",
    ],
    cta: "Start free trial",
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/mo",
    blurb: "For associations and multi-entity organizations.",
    features: [
      "Unlimited bank accounts & users",
      "Custom & scheduled reports",
      "Multi-org management",
      "API access",
      "Dedicated onboarding",
      "Dedicated support",
    ],
    cta: "Talk to sales",
  },
];

export interface CompareRow {
  label: string;
  missionledger: string | boolean;
  quickbooks: string | boolean;
}

export const COMPARE_ROWS: CompareRow[] = [
  { label: "Restricted vs. unrestricted funds", missionledger: "Native, first-class", quickbooks: "Classes / workarounds" },
  { label: "Donor records tied to the ledger", missionledger: true, quickbooks: "Separate app (add-on)" },
  { label: "Form 990 supporting schedules", missionledger: true, quickbooks: false },
  { label: "Purpose-built chart of accounts", missionledger: "By org type", quickbooks: "Generic template" },
  { label: "Guided period close with locks", missionledger: true, quickbooks: "Manual" },
  { label: "Immutable audit trail", missionledger: true, quickbooks: "Limited" },
  { label: "Pledges & multi-year campaigns", missionledger: true, quickbooks: false },
  { label: "Board-ready statement packet", missionledger: "One click", quickbooks: "Build manually" },
];

export interface ScreenshotTile {
  src: string;
  label: string;
  caption: string;
}

export const SCREENSHOTS: ScreenshotTile[] = [
  {
    src: "/images/screenshots/dashboard.png",
    label: "Executive dashboard",
    caption: "Cash, net income, and budget health at a glance.",
  },
  {
    src: "/images/screenshots/funds.png",
    label: "Fund balances",
    caption: "Restricted and unrestricted funds, live.",
  },
  {
    src: "/images/screenshots/reconciliation.png",
    label: "Bank reconciliation",
    caption: "Cleared vs. uncleared with live math.",
  },
  {
    src: "/images/screenshots/period-close.png",
    label: "Period close",
    caption: "A guided close with a permanent audit trail.",
  },
  {
    src: "/images/screenshots/990-prep.png",
    label: "990 preparation",
    caption: "Chart of accounts mapped to IRS lines.",
  },
  {
    src: "/images/screenshots/board-report.png",
    label: "Board report",
    caption: "A financial packet leadership can read.",
  },
  {
    src: "/images/screenshots/budget.png",
    label: "Budget vs. actual",
    caption: "Over-budget alerts before they become news.",
  },
  {
    src: "/images/screenshots/opening-balances.png",
    label: "Opening balances",
    caption: "Guided double-entry onboarding.",
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "Is MissionLedger only for nonprofits?",
    a: "MissionLedger is built for nonprofits, churches, and membership associations. On registration you pick your organization type, and we scaffold the right chart of accounts and terminology for how you actually operate.",
  },
  {
    q: "Can I track restricted and unrestricted funds separately?",
    a: "Yes. Funds are a first-class concept. You can create unlimited funds, flag them restricted or unrestricted, and see fund-level balances and reports at any time.",
  },
  {
    q: "Does it handle donor giving and pledges?",
    a: "Yes. Donor records, recurring gifts, multi-year pledges, giving history, and year-end contribution statements all live alongside the accounting entries they generate.",
  },
  {
    q: "What about Form 990 preparation?",
    a: "Your chart of accounts maps to Form 990 lines. You can run 990 supporting schedules whenever you like and export clean data for your tax preparer.",
  },
  {
    q: "How does month-end close work?",
    a: "Period close is a structured workflow: run the pre-close health check, reconcile accounts, soft-lock the period, and roll forward at year end — with an immutable audit trail of every action.",
  },
  {
    q: "Can I migrate easily from QuickBooks or a spreadsheet?",
    a: "The Opening Balances Wizard guides migration with a downloadable CSV template, a live accounting-equation panel, and double-entry validation so your starting point is accurate.",
  },
  {
    q: "Do I need a credit card to try it?",
    a: "No. Every plan includes a free trial with no credit card required, so you can verify the fit before you commit.",
  },
];

export interface Stat {
  value: string;
  label: string;
}

export const HERO_STATS: Stat[] = [
  { value: "3", label: "Org types supported" },
  { value: "56+", label: "Pre-built accounts" },
  { value: "4", label: "Reporting suites" },
  { value: "0", label: "Credit card to start" },
];

export const TRUST_BADGES: string[] = [
  "Fund accounting",
  "Donor CRM",
  "990 prep",
  "Bank reconciliation",
  "Period close",
  "Audit logs",
  "Board reporting",
  "Plaid bank sync",
];
