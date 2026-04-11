import { Link } from "wouter";
import {
  ArrowRight,
  Layers,
  Heart,
  BarChart3,
  RefreshCcw,
  Shield,
  Users,
  CalendarCheck,
  Building2,
  Code2,
  CheckCircle2,
  DollarSign,
  FileText,
  Lock,
  BookOpen,
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
          href="/features"
          className="text-sm font-medium text-foreground transition-colors"
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
        <Link
          href="/about"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          About
        </Link>
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
        <h1 className="text-4xl md:text-5xl font-display font-extrabold text-foreground tracking-tight leading-tight">
          Features built for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            nonprofit accounting clarity
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          MissionLedger gives nonprofits, churches, and associations the tools they need to manage
          funds, donor activity, 990 reporting, bank reconciliation, period close, opening balances,
          and financial reporting in one purpose-built system.
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
          Built for mission-driven organizations. No credit card required to start.
        </p>
      </div>
    </section>
  );
}

// ─── Intro / Positioning ──────────────────────────────────────────────────────

const POSITIONING_CARDS = [
  {
    icon: Layers,
    title: "Fund visibility built for nonprofit operations",
    body: "Track restricted and unrestricted funds the way nonprofits actually work — without forcing your team to rely on workarounds or manual spreadsheet tracking.",
  },
  {
    icon: Heart,
    title: "Donor and financial workflows that stay easier to align",
    body: "Donor records and accounting records are brought closer together so your team spends less time on manual reconciliation and fragmented data.",
  },
  {
    icon: Shield,
    title: "Reporting and close processes designed for stewardship and oversight",
    body: "Financial reporting, audit logs, and role-based access are designed around the accountability needs of mission-driven organizations.",
  },
];

function PositioningSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold">
            Why nonprofit teams need different accounting features
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Most accounting software is designed for for-profit businesses. Mission-driven
            organizations need a different kind of financial workflow — one that supports restricted
            and unrestricted funds, donor-linked records, clearer reporting, and stronger oversight.
            MissionLedger is designed specifically for nonprofits, churches, and associations, so
            your accounting tools match the way your organization actually operates.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {POSITIONING_CARDS.map((card, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <card.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Core Features Grid ───────────────────────────────────────────────────────

const CORE_FEATURES = [
  {
    icon: Layers,
    title: "True Fund Accounting",
    body: "Track restricted and unrestricted funds clearly, monitor balances by fund, and generate fund-based financial reports without custom workarounds.",
  },
  {
    icon: Heart,
    title: "Donor Tracking",
    body: "Keep donor records, pledges, recurring donations, and giving history organized so fundraising and finance stay easier to align.",
  },
  {
    icon: FileText,
    title: "990 Reporting Tool",
    body: "Support nonprofit reporting workflows with tools designed to make Form 990 preparation and processing more organized and manageable.",
  },
  {
    icon: BarChart3,
    title: "Financial Reporting",
    body: "Generate clear reports that help boards, finance committees, and leadership understand your organization's financial position.",
  },
  {
    icon: RefreshCcw,
    title: "Bank Reconciliation",
    body: "Reconcile accounts faster with connected bank feeds and a cleaner month-end review process.",
  },
  {
    icon: CalendarCheck,
    title: "Period Close Tool",
    body: "Help your team close the books with more structure, clearer review steps, and stronger confidence at month-end.",
  },
  {
    icon: BookOpen,
    title: "Opening Balances Wizard",
    body: "Get started faster by setting up opening balances in a more guided, structured workflow during onboarding or migration.",
  },
  {
    icon: Shield,
    title: "Audit-Ready Controls",
    body: "Use immutable audit logs, role-based access, and close workflows to support stronger internal controls and reporting confidence.",
  },
  {
    icon: Users,
    title: "Multi-User Collaboration",
    body: "Give team members the right level of access while keeping financial workflows organized and easier to manage.",
  },
  {
    icon: Building2,
    title: "Multi-Org Management",
    body: "For more complex organizations, manage multiple entities with clearer visibility and centralized control.",
  },
  {
    icon: Code2,
    title: "API Access",
    body: "Enterprise teams can extend workflows and connect MissionLedger more flexibly with other systems.",
  },
];

function CoreFeaturesSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Core features</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            MissionLedger combines nonprofit-native accounting, donor visibility, and clearer
            financial workflows in one platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

// ─── Feature Deep Dives ───────────────────────────────────────────────────────

const DEEP_DIVES = [
  {
    icon: Layers,
    title: "Track funds the way nonprofits actually operate",
    body: "MissionLedger is designed around nonprofit financial structure. Instead of forcing teams to rely on classes, tags, or spreadsheet workarounds, the platform helps organizations see activity by fund more clearly and report with greater confidence.",
  },
  {
    icon: Heart,
    title: "Keep donor activity and accounting closer together",
    body: "Donor records often live separately from accounting records, which creates manual reconciliation work. MissionLedger helps bring donor-related visibility and financial workflows closer together so teams can manage pledges, recurring donations, and year-end statements with less fragmentation.",
  },
  {
    icon: BarChart3,
    title: "Make reporting easier for leadership",
    body: "Boards, finance committees, and executive leaders need clear visibility into financial health, stewardship, and operations. MissionLedger helps teams produce cleaner reporting without depending on as much manual cleanup outside the system.",
  },
  {
    icon: Shield,
    title: "Strengthen oversight without adding complexity",
    body: "Permissions, audit logs, and structured close workflows help teams improve internal control and accountability while still keeping the product approachable for smaller organizations.",
  },
  {
    icon: FileText,
    title: "Make 990 reporting more manageable",
    body: "MissionLedger includes a 990 reporting tool designed to support nonprofit reporting workflows. This helps position reporting as part of the system, not just an after-the-fact export process.",
  },
  {
    icon: BookOpen,
    title: "Start with cleaner setup and migration",
    body: "The opening balances wizard is designed to make onboarding and migration feel more guided, especially for teams moving from spreadsheets or more generic systems.",
  },
];

function DeepDivesSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-display font-bold">
            A closer look at what MissionLedger helps you do
          </h2>
        </div>

        <div className="space-y-20">
          {DEEP_DIVES.map((item, i) => {
            const isEven = i % 2 === 0;
            return (
              <div
                key={i}
                className={`flex flex-col md:flex-row items-center gap-10 md:gap-16 ${
                  isEven ? "" : "md:flex-row-reverse"
                }`}
              >
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                    <item.icon className="w-12 h-12" />
                  </div>
                </div>
                <div className="flex-[2]">
                  <h3 className="text-2xl font-display font-bold mb-4">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-base">{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Product Visuals ──────────────────────────────────────────────────────────

const PRODUCT_TILES = [
  { icon: Layers, label: "Fund balances by fund" },
  { icon: Heart, label: "Donor pledges and recurring donations" },
  { icon: RefreshCcw, label: "Month-end reconciliation workflow" },
  { icon: Lock, label: "Audit logs and permissions" },
  { icon: FileText, label: "Board-ready financial reports" },
];

function ProductVisualsSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">See the product in action</h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            From fund balances to donor records to reporting workflows, MissionLedger is designed to
            make nonprofit financial management feel clearer and more manageable.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {PRODUCT_TILES.map((tile, i) => (
            <div
              key={i}
              className={`rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-4 p-10 shadow-sm hover:shadow-md transition-all group ${
                i === 4 ? "col-span-2 md:col-span-1" : ""
              }`}
            >
              <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <tile.icon className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-center text-muted-foreground">{tile.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Built for Org Types ──────────────────────────────────────────────────────

const ORG_TYPES = [
  {
    icon: CheckCircle2,
    title: "Nonprofits",
    body: "MissionLedger helps nonprofit teams manage funds, donor activity, and reporting with a workflow designed around stewardship rather than profit.",
  },
  {
    icon: CheckCircle2,
    title: "Churches",
    body: "Churches can use MissionLedger to manage donations, fund visibility, and financial reporting in a system built for mission-focused operations.",
  },
  {
    icon: CheckCircle2,
    title: "Associations",
    body: "Associations can use MissionLedger to manage organizational finances with clearer oversight, reporting, and collaboration across teams.",
  },
];

function OrgTypesSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Built for mission-driven organizations</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {ORG_TYPES.map((org, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <org.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2">{org.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{org.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Why Teams Choose MissionLedger ──────────────────────────────────────────

const WHY_CHOOSE = [
  {
    icon: Layers,
    title: "Purpose-built for nonprofit workflows",
    body: "Every feature is designed around how mission-driven organizations manage funds, donors, and reporting — not adapted from a for-profit tool.",
  },
  {
    icon: BarChart3,
    title: "Simpler financial clarity",
    body: "Cleaner reporting, fund-based visibility, and structured workflows help teams spend less time on manual cleanup and more time focused on the mission.",
  },
  {
    icon: Users,
    title: "Better fit for lean teams",
    body: "MissionLedger is approachable for smaller finance teams that don't have dedicated accountants, while still supporting more complex organizational needs.",
  },
  {
    icon: DollarSign,
    title: "Transparent pricing",
    body: "Straightforward monthly pricing without complicated enterprise packaging or hidden fees — designed to be accessible for nonprofits at any stage.",
  },
];

function WhyChooseSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Why teams choose MissionLedger over generic accounting tools
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-8 mb-12">
          {WHY_CHOOSE.map((item, i) => (
            <div
              key={i}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
          >
            See pricing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Features That Grow With You ──────────────────────────────────────────────

const PLAN_CARDS = [
  {
    name: "Starter",
    body: "Core accounting, donor tracking, and guided setup for small teams",
  },
  {
    name: "Professional",
    body: "Advanced reporting, bank reconciliation, period close workflows, and 990 support for growing organizations",
    popular: true,
  },
  {
    name: "Enterprise",
    body: "Custom reporting, multi-org management, unlimited users, and API access for more advanced needs",
  },
];

function GrowWithYouSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold">
            Features that grow with your organization
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            MissionLedger is designed to support organizations from very small teams to more
            advanced multi-entity operations. Start with the essentials and upgrade as your
            reporting, collaboration, and organizational complexity grow.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-10">
          {PLAN_CARDS.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-2xl border p-8 shadow-sm hover:shadow-md transition-all ${
                plan.popular
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-background"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full shadow">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold mb-3">{plan.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{plan.body}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link href="/pricing">
            <Button variant="outline" size="lg" className="px-8">
              View pricing
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Is MissionLedger built specifically for nonprofits?",
    a: "Yes. MissionLedger is designed for nonprofits, churches, and associations that need fund accounting, donor tracking, and nonprofit-friendly financial reporting.",
  },
  {
    q: "Does MissionLedger support fund accounting?",
    a: "Yes. MissionLedger is designed to support fund-based visibility so organizations can track and report on restricted and unrestricted activity more clearly.",
  },
  {
    q: "Does MissionLedger include donor tracking?",
    a: "Yes. MissionLedger includes donor tracking features such as pledges, recurring donations, donor records, and giving history.",
  },
  {
    q: "Does MissionLedger support 990 reporting?",
    a: "Yes. MissionLedger includes a 990 reporting tool designed to help organizations manage nonprofit reporting workflows more effectively.",
  },
  {
    q: "Does MissionLedger help with month-end close?",
    a: "Yes. MissionLedger includes bank reconciliation and a period close tool to support a more structured and manageable close process.",
  },
  {
    q: "Does MissionLedger include an opening balances wizard?",
    a: "Yes. MissionLedger includes an opening balances wizard to help teams set up and migrate more cleanly.",
  },
  {
    q: "Can multiple team members use MissionLedger?",
    a: "Yes. Professional includes multi-user access, and Enterprise includes unlimited users.",
  },
  {
    q: "Can I try MissionLedger before committing?",
    a: "Yes. MissionLedger offers a free trial with no credit card required.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Frequently asked questions</h2>
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
          Explore features built for financial stewardship
        </h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
          Start your free trial or book a demo to see how MissionLedger helps mission-driven
          organizations manage funds, donors, reporting, and oversight more clearly.
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
        <a href={`${BASE}/about`} className="hover:opacity-100 hover:underline">
          About
        </a>
        <span className="opacity-40">·</span>
        <a href={`${BASE}/security`} className="hover:opacity-100 hover:underline">
          Security
        </a>
        <span className="opacity-40">·</span>
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

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <PositioningSection />
        <CoreFeaturesSection />
        <DeepDivesSection />
        <ProductVisualsSection />
        <OrgTypesSection />
        <WhyChooseSection />
        <GrowWithYouSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
