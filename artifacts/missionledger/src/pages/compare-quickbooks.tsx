import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Check,
  Layers,
  Users,
  FileText,
  CalendarCheck,
  BookOpen,
  BarChart3,
  ShieldCheck,
  Zap,
  Scale,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-50 border-b border-border/50">
      <div className="flex items-center">
        <Link href="/">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="MissionLedger"
            className="h-10 w-auto object-contain cursor-pointer"
          />
        </Link>
      </div>
      <nav className="hidden md:flex items-center gap-6">
        <Link
          href="/#features"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Features
        </Link>
        <Link
          href="/pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Pricing
        </Link>
        <a
          href="#faq"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          FAQ
        </a>
      </nav>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Log in
        </Link>
        <Link href="/register">
          <Button className="shadow-lg shadow-primary/20">Start free trial</Button>
        </Link>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative pt-24 pb-20 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background/80 to-background" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
          {["Nonprofits", "Churches", "Associations"].map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
            >
              Built for {label}
            </span>
          ))}
        </div>

        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-foreground tracking-tight leading-tight">
          MissionLedger vs QuickBooks:{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            which is better for nonprofits?
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Many nonprofits start with QuickBooks because it is familiar and widely used. But as
          financial complexity grows, mission-driven organizations often need workflows that generic
          accounting tools do not handle as naturally — including fund accounting, donor tracking,
          990 reporting, structured month-end close, and nonprofit-specific reporting. MissionLedger
          is designed to meet those needs from the start.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="h-14 px-8 text-base shadow-xl shadow-primary/25 group">
              Start free trial
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/register">
            <Button size="lg" variant="outline" className="h-14 px-8 text-base bg-card/50 backdrop-blur">
              Book a demo
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-xs text-muted-foreground/60 max-w-xl mx-auto">
          QuickBooks is a trademark of Intuit Inc. MissionLedger is not affiliated with or endorsed by Intuit.
        </p>
      </div>
    </section>
  );
}

// ─── Quick Answer ─────────────────────────────────────────────────────────────

const CHOOSE_ML = [
  "You need true fund accounting for restricted and unrestricted funds",
  "You want donor tracking and financial records to live closer together",
  "You need 990 reporting support built into your workflow",
  "You want a more structured month-end process with bank reconciliation and period close tools",
  "You want a guided opening balances workflow for setup or migration",
  "You want a workflow designed for nonprofits, churches, or associations",
];

const CHOOSE_QB = [
  "Your organization has very simple bookkeeping needs",
  "You already rely on QuickBooks and have established workarounds",
  "You do not need nonprofit-native fund workflows",
  "Your accountant manages most of the customization outside the software",
  "You are comfortable combining accounting with separate tools for donor tracking and nonprofit reporting",
];

function QuickAnswerSection() {
  return (
    <section className="py-20 bg-card border-y border-border">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-bold">The quick answer</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            The right tool depends on your organization's complexity and how central nonprofit-specific
            workflows are to your finance operations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Choose MissionLedger */}
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-8 shadow-sm">
            <h3 className="text-lg font-bold mb-5 text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              Choose MissionLedger if...
            </h3>
            <ul className="space-y-3">
              {CHOOSE_ML.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* QuickBooks may still work */}
          <div className="rounded-2xl border border-border bg-background p-8 shadow-sm">
            <h3 className="text-lg font-bold mb-5 text-foreground flex items-center gap-2">
              <Scale className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              QuickBooks may still work if...
            </h3>
            <ul className="space-y-3">
              {CHOOSE_QB.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Comparison Table ─────────────────────────────────────────────────────────

const COMPARISON_ROWS: { feature: string; ml: string; qb: string; mlStrong?: boolean }[] = [
  {
    feature: "Primary audience",
    ml: "Nonprofits, churches, and associations",
    qb: "General small businesses",
    mlStrong: true,
  },
  {
    feature: "Fund accounting",
    ml: "Built for fund-based visibility",
    qb: "Often handled with classes, tags, or workarounds",
    mlStrong: true,
  },
  {
    feature: "Restricted vs unrestricted funds",
    ml: "Designed for nonprofit fund tracking",
    qb: "Possible with setup work, but not nonprofit-native",
    mlStrong: true,
  },
  {
    feature: "Donor tracking",
    ml: "Included as part of the platform",
    qb: "Often handled with separate tools or integrations",
    mlStrong: true,
  },
  {
    feature: "990 reporting support",
    ml: "Includes a 990 reporting tool",
    qb: "Typically handled outside the system",
    mlStrong: true,
  },
  {
    feature: "Bank reconciliation",
    ml: "Included as part of the workflow",
    qb: "Included, designed for general business",
  },
  {
    feature: "Period close workflow",
    ml: "Includes a period close tool",
    qb: "Depends on team process and customization",
    mlStrong: true,
  },
  {
    feature: "Opening balances setup",
    ml: "Includes an opening balances wizard",
    qb: "Setup possible, not nonprofit-specific guided flow",
    mlStrong: true,
  },
  {
    feature: "Board-ready reporting",
    ml: "Built for nonprofit financial visibility",
    qb: "General business reporting, customization needed",
    mlStrong: true,
  },
  {
    feature: "Audit and oversight",
    ml: "Audit logs, permissions, close workflows",
    qb: "Varies by plan and setup",
    mlStrong: true,
  },
  {
    feature: "Pricing approach",
    ml: "Simple nonprofit-focused monthly tiers",
    qb: "Business-focused pricing and plan packaging",
    mlStrong: true,
  },
  {
    feature: "Best fit",
    ml: "Mission-driven organizations",
    qb: "Organizations comfortable adapting general business software",
    mlStrong: true,
  },
];

function ComparisonTableSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Feature comparison</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            How MissionLedger and QuickBooks compare across the workflows that matter most to
            mission-driven organizations.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="text-left py-4 px-6 font-semibold text-foreground w-1/3">Feature</th>
                <th className="text-left py-4 px-6 font-semibold text-primary bg-primary/5">
                  MissionLedger
                </th>
                <th className="text-left py-4 px-6 font-semibold text-foreground">QuickBooks</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-border last:border-b-0 ${
                    i % 2 === 0 ? "bg-background" : "bg-card/50"
                  }`}
                >
                  <td className="py-4 px-6 font-medium text-foreground">{row.feature}</td>
                  <td className="py-4 px-6 bg-primary/5">
                    <span className="flex items-start gap-2">
                      {row.mlStrong && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      )}
                      <span className="text-sm text-foreground">{row.ml}</span>
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm text-muted-foreground">{row.qb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Why Nonprofits Outgrow QuickBooks ───────────────────────────────────────

const OUTGROW_CARDS = [
  {
    icon: Layers,
    title: "Fund tracking gets more complex",
    body: "As your organization manages restricted and unrestricted funds, program activity, and grant-related reporting, workarounds can become harder to maintain.",
  },
  {
    icon: Users,
    title: "Donor and finance data drift apart",
    body: "When donor records live in one tool and accounting lives in another, reconciliation and reporting can become more manual.",
  },
  {
    icon: CalendarCheck,
    title: "Month-end needs more structure",
    body: "As accounting complexity grows, teams often need stronger workflows for bank reconciliation, close review, and reporting consistency.",
  },
  {
    icon: FileText,
    title: "Nonprofit reporting requires extra work",
    body: "Tasks like 990 preparation and board reporting often require more manual effort when using a general business accounting tool.",
  },
];

function OutgrowSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-display font-bold">
            Why nonprofits outgrow QuickBooks
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            QuickBooks is a capable general accounting tool. But as mission-driven organizations grow
            in complexity, certain patterns tend to emerge — and they usually point toward the same
            gaps.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {OUTGROW_CARDS.map((card, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <card.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-3">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Why MissionLedger Is Different ──────────────────────────────────────────

const DIFFERENT_CARDS = [
  {
    icon: Zap,
    title: "Purpose-built for mission-driven organizations",
    body: "MissionLedger was designed from the ground up for nonprofits, churches, and associations — not adapted from software built for retail or service businesses.",
  },
  {
    icon: Layers,
    title: "Nonprofit workflows in one system",
    body: "Fund accounting, donor tracking, 990 reporting support, bank reconciliation, period close, and opening balances are all part of the same platform.",
  },
  {
    icon: Users,
    title: "Better fit for lean teams",
    body: "Guided workflows, clear labeling, and structured processes are designed for small finance teams and bookkeepers — not just experienced accountants.",
  },
  {
    icon: BookOpen,
    title: "Easier setup and migration",
    body: "The Opening Balances Wizard walks you through entering starting balances and donor records in a structured flow so your transition is clean from day one.",
  },
];

function WhyDifferentSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Why MissionLedger is different</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            The difference is not just features — it is the starting assumption. MissionLedger
            begins with the nonprofit use case and builds from there.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {DIFFERENT_CARDS.map((card, i) => (
            <div
              key={i}
              className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <card.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2 text-sm">{card.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── A Closer Look at Key Differences ────────────────────────────────────────

const KEY_DIFFERENCES = [
  {
    icon: Layers,
    title: "Fund accounting",
    body: "MissionLedger is structured around funds from the beginning. You create individual funds — restricted grants, operating funds, capital campaigns — and all transactions are assigned at entry. Fund-level balances update in real time and fund-level reports are available without custom configuration. In QuickBooks, fund-level tracking is often approximated using classes, locations, or tags, which can work but requires more upfront setup and discipline to maintain consistently.",
  },
  {
    icon: Users,
    title: "Donor tracking",
    body: "In MissionLedger, donor records and accounting entries are part of the same system. When a donation is recorded, it creates both a donor record and a general ledger entry. Pledge balances, giving history, and acknowledgment records are accessible alongside the corresponding financial data. With QuickBooks, donor tracking is often handled through separate tools or integrations, which can introduce reconciliation work when financial data and donor data need to align.",
  },
  {
    icon: FileText,
    title: "990 reporting",
    body: "MissionLedger includes a 990 Reporting Tool that maps your chart of accounts to IRS Form 990 lines. You can run supporting schedules throughout the year and export the data your tax preparer or CPA needs at year-end. With QuickBooks, 990 preparation typically happens outside the system, often involving manual exports and reconciliation with a separate tool or external process.",
  },
  {
    icon: CalendarCheck,
    title: "Month-end close",
    body: "MissionLedger's Period Close Tool is a structured workflow that walks your team through each step required to close a month or year: reconcile accounts, review entries, lock the period, and sign off with an audit trail. In QuickBooks, month-end close is more of an informal process — teams often manage it with external checklists or individual accountant preference, with varying levels of structure depending on the setup.",
  },
  {
    icon: BookOpen,
    title: "Getting started",
    body: "MissionLedger includes an Opening Balances Wizard that guides new users through entering starting fund balances, account balances, and donor records in a structured flow. This is especially useful for organizations migrating from a different system or moving away from spreadsheets. QuickBooks does support opening balance entry, but the process is not specifically designed for the nonprofit use case or the fund-based starting point that nonprofit organizations typically need.",
  },
];

function KeyDifferencesSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            A closer look at key differences
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            The comparison becomes clearer when you look at specific workflows that nonprofits rely
            on most.
          </p>
        </div>

        <div className="space-y-10">
          {KEY_DIFFERENCES.map((item, i) => (
            <div key={i} className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mt-1">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Who Should Choose What ───────────────────────────────────────────────────

const WHO_ML = [
  "Nonprofits that need to track restricted and unrestricted funds separately",
  "Churches managing designated gift funds, building funds, or general operating budgets",
  "Associations tracking program-specific activity and member contributions",
  "Organizations that want donor records and financial records in one system",
  "Finance teams that need a structured month-end close process",
  "Organizations preparing or supporting 990 preparation internally",
  "Teams switching from spreadsheets or a general accounting tool that does not fit their nonprofit workflow",
];

const WHO_QB = [
  "Organizations with straightforward, single-fund bookkeeping needs",
  "Teams already deeply invested in QuickBooks with established workflows",
  "Organizations whose accountants handle all customization outside the software",
  "Very early-stage nonprofits not yet managing fund-level complexity",
  "Organizations that rely on third-party integrations for donor tracking and reporting",
];

function WhoShouldChooseSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Who should choose what</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            The best tool depends on your organization's complexity, team structure, and how central
            nonprofit workflows are to your day-to-day accounting.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-8 shadow-sm">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              MissionLedger is likely the better fit if...
            </h3>
            <ul className="space-y-3">
              {WHO_ML.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              QuickBooks may still be enough if...
            </h3>
            <ul className="space-y-3">
              {WHO_QB.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Is MissionLedger actually designed for nonprofits, or is it adapted from general accounting software?",
    a: "MissionLedger was designed from the ground up for nonprofits, churches, and associations. Fund accounting, donor tracking, 990 reporting, and month-end close workflows are all part of the core product — not add-ons or workarounds applied to a general business accounting tool.",
  },
  {
    q: "Can QuickBooks handle fund accounting for nonprofits?",
    a: "QuickBooks can approximate fund-level tracking using classes, locations, or tags. Many nonprofits use this approach successfully. However, it typically requires deliberate setup and ongoing discipline to maintain, and it is not how QuickBooks is primarily designed to work. MissionLedger is built around fund-based accounting as its default structure.",
  },
  {
    q: "Does MissionLedger replace our need for a CPA or bookkeeper?",
    a: "No. MissionLedger is a tool that supports your finance team or bookkeeper — it does not replace the need for qualified financial oversight. What it does is give your team a more structured, nonprofit-native workflow so that the accounting process itself requires fewer workarounds and manual steps.",
  },
  {
    q: "How hard is it to migrate from QuickBooks to MissionLedger?",
    a: "MissionLedger includes an Opening Balances Wizard that guides you through entering starting fund balances, account balances, and donor records. You do not need to import data from QuickBooks — you enter your starting point directly through the wizard. Most teams find this cleaner than a direct data migration.",
  },
  {
    q: "Does MissionLedger support bank reconciliation like QuickBooks does?",
    a: "Yes. MissionLedger includes bank reconciliation as part of its workflow. You can import transactions via Plaid or CSV, match entries to your ledger, and produce a reconciliation report. The reconciliation tool is integrated with the period close workflow so the two processes stay connected.",
  },
  {
    q: "Is 990 reporting really built into MissionLedger?",
    a: "Yes. MissionLedger includes a 990 Reporting Tool that maps your chart of accounts to IRS Form 990 lines. You can run supporting schedules throughout the year and export data for your tax preparer at year-end. This is distinct from QuickBooks, where 990 preparation typically happens entirely outside the accounting system.",
  },
  {
    q: "Do I need to sign a long-term contract to use MissionLedger?",
    a: "No. MissionLedger uses simple monthly pricing with no long-term contracts required. Every plan includes a free trial with no credit card needed, so you can evaluate the product before committing.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="py-24 bg-card border-y border-border">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Common questions from organizations evaluating MissionLedger against QuickBooks.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-base font-medium text-left">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCtaSection() {
  return (
    <section className="py-24 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-extrabold mb-6">
          Ready for nonprofit accounting that actually fits your organization?
        </h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
          Start your free trial or book a demo to see how MissionLedger compares in practice.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register">
            <Button
              size="lg"
              className="h-14 px-8 text-base bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-xl group"
            >
              Start free trial
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-base border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
            >
              Book a demo
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm opacity-70">No credit card required. Free trial on every plan.</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-foreground text-background py-12 text-center">
      <div className="flex items-center justify-center gap-4 text-sm opacity-70 mb-2 flex-wrap">
        <a href={`${BASE}/terms`} className="hover:opacity-100 hover:underline">
          Terms of Service
        </a>
        <span className="opacity-40">·</span>
        <a href={`${BASE}/privacy`} className="hover:opacity-100 hover:underline">
          Privacy Policy
        </a>
      </div>
      <p className="text-muted opacity-50 text-sm">
        © {new Date().getFullYear()} MissionLedger. All rights reserved.
      </p>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompareQuickbooksPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <QuickAnswerSection />
        <ComparisonTableSection />
        <OutgrowSection />
        <WhyDifferentSection />
        <KeyDifferencesSection />
        <WhoShouldChooseSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
