import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  BookOpen,
  Users,
  FileText,
  CreditCard,
  CalendarCheck,
  LayoutDashboard,
  ShieldCheck,
  BarChart3,
  Building2,
  Church,
  Handshake,
  Zap,
  Scale,
  DollarSign,
  Layers,
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
        <img
          src={`${import.meta.env.BASE_URL}images/logo.png`}
          alt="MissionLedger"
          className="h-10 w-auto object-contain"
        />
      </div>
      <nav className="hidden md:flex items-center gap-6">
        <a
          href="#features"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Features
        </a>
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

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative pt-24 pb-32 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt=""
          role="presentation"
          className="w-full h-full object-cover opacity-15"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
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

        <h1 className="text-4xl md:text-6xl font-display font-extrabold text-foreground tracking-tight max-w-4xl mx-auto leading-tight">
          Nonprofit accounting software built for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            fund tracking, donor workflows, 990 reporting,
          </span>{" "}
          and cleaner month-end close
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          MissionLedger helps nonprofits, churches, and associations manage fund accounting, donor
          tracking, 990 reporting, bank reconciliation, period close, opening balances, and financial
          reporting in one purpose-built system.
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

        <p className="mt-4 text-sm text-muted-foreground">
          Free trial included on every plan — no credit card required.
        </p>
      </div>
    </section>
  );
}

// ─── Section 2: Why MissionLedger ────────────────────────────────────────────

function WhySection() {
  return (
    <section className="py-20 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-display font-bold">
            Stop forcing generic accounting software to do nonprofit work
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Most accounting software was built for for-profit businesses. Mission-driven
            organizations need tools for restricted and unrestricted funds, donor tracking, 990
            reporting, and stronger close processes. MissionLedger is designed specifically for
            nonprofits, churches, and associations, so your financial workflow makes sense from
            the start.
          </p>
          <div className="mt-6">
            <Link href="/compare/quickbooks" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              See how MissionLedger compares to QuickBooks →
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Track funds the way nonprofits actually operate",
              body: "Separate restricted and unrestricted funds without workarounds. See the balance of every fund at a glance and produce fund-level reports your board can read.",
            },
            {
              title: "Keep donor and financial records easier to align",
              body: "Connect donation activity directly to your general ledger. Donor records, pledge tracking, and giving history live alongside the accounting entries they generate.",
            },
            {
              title: "Close the books with more structure and confidence",
              body: "A guided period-close workflow, opening balances wizard, and bank reconciliation tool give you the structure to finish each month cleanly.",
            },
          ].map((card, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all"
            >
              <h3 className="text-lg font-bold mb-3">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 3: Core Features ─────────────────────────────────────────────────

const CORE_FEATURES = [
  {
    icon: Layers,
    title: "True Fund Accounting",
    body: "Track restricted and unrestricted funds independently, generate fund-level balance sheets, and produce statement of functional expenses with a properly structured chart of accounts.",
  },
  {
    icon: Users,
    title: "Donor Tracking",
    body: "Record donations, track pledges and pledge balances, link donors to fund designations, and generate giving histories and acknowledgment letters.",
  },
  {
    icon: FileText,
    title: "990 Reporting Tool",
    body: "Map your accounts to IRS Form 990 lines. Run supporting schedules and export the data you need to prepare or review your annual information return.",
  },
  {
    icon: CreditCard,
    title: "Bank Reconciliation",
    body: "Import transactions via Plaid or CSV. Match entries to your ledger, clear discrepancies, and produce a reconciliation report ready for your auditor.",
  },
  {
    icon: CalendarCheck,
    title: "Period Close Tool",
    body: "A guided month-end and year-end close checklist walks your team through every required step so nothing gets skipped and the period locks cleanly.",
  },
  {
    icon: BookOpen,
    title: "Opening Balances Wizard",
    body: "Enter your starting fund balances, account balances, and donor records in a structured guided setup that gets you operational without importing errors.",
  },
  {
    icon: ShieldCheck,
    title: "Audit-Ready Controls",
    body: "Immutable audit logs, role-based access, locked periods, and journal entry trails give your auditors the documentation trail they need.",
  },
  {
    icon: BarChart3,
    title: "Board-Ready Reporting",
    body: "Statement of financial position, statement of activities, functional expense report, and fund summaries formatted for board presentation.",
  },
];

function CoreFeaturesSection() {
  return (
    <section id="features" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Everything you need to manage your mission
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            MissionLedger combines nonprofit-native accounting, donor visibility, reporting support,
            and stronger month-end workflows in one platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CORE_FEATURES.map((feat, i) => (
            <div
              key={i}
              className="bg-card p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feat.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2 text-sm">{feat.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{feat.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 4: Deeper Product Story ─────────────────────────────────────────

const PRODUCT_STORY = [
  {
    icon: Layers,
    title: "Fund tracking that maps to how you operate",
    body: "Most accounting software handles one general pool of money. MissionLedger lets you create and track individual funds — general operating, restricted grants, capital campaigns, endowments — with balances that update in real time. Fund-level reports are one click away.",
  },
  {
    icon: Users,
    title: "Donor activity and accounting in one place",
    body: "When a donor gives, MissionLedger records the transaction in your ledger and adds it to the donor record simultaneously. Track pledge balances, send acknowledgments, and see giving history without ever leaving the financial system.",
  },
  {
    icon: FileText,
    title: "990 reporting built into your workflow",
    body: "Your chart of accounts maps directly to IRS Form 990 lines. Run 990 supporting schedules at any time, export data for your tax preparer, and reduce the scramble at year-end.",
  },
  {
    icon: CalendarCheck,
    title: "A guided month-end close process",
    body: "Period close in MissionLedger is a structured workflow, not a checklist you keep in a spreadsheet. Walk through each required step, reconcile your accounts, lock the period, and sign off with a clear audit trail.",
  },
  {
    icon: BookOpen,
    title: "Opening balances setup that actually works",
    body: "Getting started shouldn't mean importing messy data from your old system. The Opening Balances Wizard walks you through entering fund balances, account balances, and donor records in a guided flow so your starting point is accurate.",
  },
];

function DeeperProductSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            A clearer way to manage nonprofit finances
          </h2>
        </div>

        <div className="space-y-12">
          {PRODUCT_STORY.map((item, i) => (
            <div
              key={i}
              className={`flex flex-col md:flex-row gap-8 items-start ${
                i % 2 !== 0 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <item.icon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 5: Built for Org Types ──────────────────────────────────────────

const ORG_TYPES = [
  {
    icon: Building2,
    title: "Nonprofits",
    body: "Fund accounting, grant tracking, 990 reporting, functional expense reporting, and audit-ready controls designed for 501(c)(3) and other exempt organizations.",
  },
  {
    icon: Church,
    title: "Churches",
    body: "Tithe and offering tracking, restricted fund management for designated gifts, benevolence tracking, and board-level financial reporting for congregational leadership.",
  },
  {
    icon: Handshake,
    title: "Associations",
    body: "Membership dues, chapter fund tracking, event income, and financial reporting that gives your board the visibility they need without extra complexity.",
  },
];

function OrgTypesSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Built for the way mission-driven organizations actually work
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {ORG_TYPES.map((org, i) => (
            <div
              key={i}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform">
                <org.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold mb-3">{org.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{org.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 6: Why Teams Choose MissionLedger ───────────────────────────────

const WHY_CHOOSE = [
  {
    icon: Zap,
    title: "Purpose-built",
    body: "MissionLedger was designed from the ground up for nonprofits, churches, and associations — not adapted from software built for retail or professional services businesses.",
  },
  {
    icon: Scale,
    title: "Simpler financial clarity",
    body: "Fund balances, donor activity, period status, and reporting are all visible in one system. No exports to spreadsheets, no stitching together reports from different tools.",
  },
  {
    icon: Users,
    title: "Better fit for lean teams",
    body: "You don't need an accountant on staff to run MissionLedger. Guided workflows, clear labels, and structured processes are designed for small finance teams and bookkeepers.",
  },
  {
    icon: DollarSign,
    title: "Transparent pricing",
    body: "Flat monthly pricing with no per-transaction fees, no surprise charges, and a free trial on every plan so you can verify it works before you commit.",
  },
];

function WhyChooseSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Why mission-driven teams choose MissionLedger
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {WHY_CHOOSE.map((item, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 7: Product Visuals ───────────────────────────────────────────────

const VISUAL_TILES = [
  { icon: Layers, caption: "Fund balances by fund" },
  { icon: Users, caption: "Donor tracking" },
  { icon: FileText, caption: "990 reporting workflow" },
  { icon: CreditCard, caption: "Bank reconciliation" },
  { icon: CalendarCheck, caption: "Period close" },
  { icon: BookOpen, caption: "Opening balances wizard" },
  { icon: ShieldCheck, caption: "Audit logs" },
  { icon: BarChart3, caption: "Board-ready reports" },
];

function ProductVisualsSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">See the product in action</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            From fund balances to donor tracking to reporting workflows and month-end close,
            MissionLedger is designed to make nonprofit financial management feel clearer and more
            manageable.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {VISUAL_TILES.map((tile, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-4 shadow-sm hover:shadow-md transition-all aspect-square"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <tile.icon className="w-7 h-7" />
              </div>
              <p className="text-sm font-medium text-center text-foreground">{tile.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section 8: Pricing ───────────────────────────────────────────────────────

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "$19.99",
    period: "/mo",
    popular: false,
    features: [
      "1 bank account",
      "500 transactions/month",
      "Standard reports",
      "Donor tracking",
      "Opening balances wizard",
      "Email support",
      "Plaid bank sync",
    ],
    cta: "Start free trial",
    ctaHref: "/register",
    ctaVariant: "outline" as const,
  },
  {
    name: "Professional",
    price: "$49",
    period: "/mo",
    popular: true,
    features: [
      "5 bank accounts",
      "Unlimited transactions",
      "Advanced reports",
      "Donor tracking",
      "Bank reconciliation",
      "Period close tool",
      "990 reporting tool",
      "Priority support",
      "Plaid bank sync",
      "Multi-user access",
    ],
    cta: "Start free trial",
    ctaHref: "/register",
    ctaVariant: "default" as const,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/mo",
    popular: false,
    features: [
      "Unlimited bank accounts",
      "Unlimited transactions",
      "Custom reports",
      "Dedicated support",
      "Multi-organization",
      "API access",
      "Everything in Professional",
    ],
    cta: "Talk to sales",
    ctaHref: "/register",
    ctaVariant: "outline" as const,
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Simple, transparent pricing</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Start with the essentials, upgrade as your organization grows, and only pay for the
            complexity you actually need.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 shadow-sm transition-all hover:shadow-md ${
                plan.popular
                  ? "border-primary bg-primary/5 ring-2 ring-primary shadow-primary/10"
                  : "border-border bg-background"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full shadow">
                  Most Popular
                </span>
              )}
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-4xl font-extrabold text-foreground">
                  {plan.price}
                  <span className="text-base font-normal text-muted-foreground">{plan.period}</span>
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Link href={plan.ctaHref}>
                <Button className="w-full" variant={plan.ctaVariant}>
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          All plans include a free trial. No credit card required.
        </p>
      </div>
    </section>
  );
}

// ─── Section 9: FAQ ───────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Is MissionLedger built specifically for nonprofits?",
    a: "Yes. MissionLedger was designed from the ground up for nonprofits, churches, and associations — not retrofitted from software built for businesses. Fund accounting, donor tracking, 990 reporting, and the month-end close workflow are all built into the core product.",
  },
  {
    q: "How does fund tracking work?",
    a: "You create individual funds — restricted grants, operating funds, capital campaigns, endowments — and all transactions are assigned to a fund at entry. MissionLedger maintains a live balance per fund and lets you run fund-level balance sheets and activity reports at any time.",
  },
  {
    q: "Can I track donors and giving history?",
    a: "Yes. Every donation is attached to a donor record. You can track pledge balances, view full giving histories, send acknowledgment letters, and export donor data for year-end tax statements. Donor activity is linked directly to the corresponding general ledger entries.",
  },
  {
    q: "Does MissionLedger support 990 reporting?",
    a: "MissionLedger includes a 990 Reporting Tool that maps your chart of accounts to IRS Form 990 lines. You can run supporting schedules throughout the year and export data to share with your tax preparer or CPA, reducing the work required at year-end.",
  },
  {
    q: "What does the month-end close process look like?",
    a: "MissionLedger's Period Close Tool walks your team through a structured checklist for month-end and year-end close. Each step is tracked, periods lock when closed, and the process produces a clear audit trail showing who completed each step and when.",
  },
  {
    q: "How do I migrate my opening balances when I switch?",
    a: "The Opening Balances Wizard guides you through entering your starting fund balances, account balances, and donor records in a structured setup flow. You don't need to import data from your old system — you enter starting balances directly through the wizard.",
  },
  {
    q: "Do I need a credit card to start a free trial?",
    a: "No. Every MissionLedger plan includes a free trial with no credit card required. You can explore the full product before deciding which plan fits your organization.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Questions organizations ask before switching
          </h2>
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

// ─── Section 10: Final CTA ────────────────────────────────────────────────────

function FinalCtaSection() {
  return (
    <section className="py-24 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-extrabold mb-6">
          Get financial clarity built for your mission
        </h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
          Try MissionLedger free and see how much easier nonprofit accounting can feel when your
          software is built for funds, donors, 990 reporting, and month-end stewardship from day
          one.
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <WhySection />
        <CoreFeaturesSection />
        <DeeperProductSection />
        <OrgTypesSection />
        <WhyChooseSection />
        <ProductVisualsSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
