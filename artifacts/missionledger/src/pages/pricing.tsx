import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  BarChart3,
  Layers,
  FileText,
  Zap,
  TrendingUp,
  Target,
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
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Features
        </Link>
        <a
          href="#pricing"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Pricing
        </a>
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
          Simple, transparent pricing for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            mission-driven organizations
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          MissionLedger gives nonprofits, churches, and associations nonprofit-focused accounting,
          donor tracking, 990 reporting, bank reconciliation, period close workflows, and financial
          reporting with straightforward monthly pricing.
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
          No credit card required. Choose the plan that fits your organization's size and complexity.
        </p>
      </div>
    </section>
  );
}

// ─── Pricing Cards ────────────────────────────────────────────────────────────

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "$19.99",
    period: "/mo",
    popular: false,
    description: "For very small organizations getting out of spreadsheets and setting up core nonprofit accounting workflows.",
    features: [
      "1 bank account",
      "Up to 500 transactions/month",
      "Standard financial reports",
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
    description: "For growing organizations that need stronger reporting, cleaner closes, and team collaboration.",
    features: [
      "5 bank accounts",
      "Unlimited transactions",
      "Advanced reports & analytics",
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
    description: "For organizations managing multiple entities, advanced reporting needs, or larger finance teams.",
    features: [
      "Unlimited bank accounts",
      "Unlimited transactions",
      "Custom reports",
      "Donor tracking",
      "Bank reconciliation",
      "Period close tool",
      "990 reporting tool",
      "Opening balances wizard",
      "Dedicated support",
      "Plaid bank sync",
      "Unlimited users",
      "Multi-org management",
      "API access",
    ],
    cta: "Talk to sales",
    ctaHref: "/register",
    ctaVariant: "outline" as const,
  },
];

function PricingCardsSection() {
  return (
    <section id="pricing" className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
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
                {"description" in plan && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
                )}
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

// ─── What's Included ──────────────────────────────────────────────────────────

const INCLUDED_FEATURES = [
  {
    icon: Layers,
    title: "Nonprofit-focused accounting workflows",
    body: "Fund accounting, chart of accounts, and reporting built around how mission-driven organizations actually operate.",
  },
  {
    icon: Cloud,
    title: "Secure cloud access",
    body: "Access your financial data from anywhere with role-based controls and encrypted data storage.",
  },
  {
    icon: BarChart3,
    title: "Fund-based financial visibility",
    body: "See balances and activity at the fund level so your team always knows where restricted and unrestricted money stands.",
  },
  {
    icon: FileText,
    title: "Core reporting tools",
    body: "Statement of financial position, statement of activities, and fund summaries available on every plan.",
  },
  {
    icon: Zap,
    title: "Ongoing product updates",
    body: "All plans receive new features and improvements as we continue to build MissionLedger for the nonprofit sector.",
  },
];

function WhatsIncludedSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            What's included in every plan
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Every MissionLedger plan includes the core tools nonprofits, churches, and associations
            need to manage their finances with more clarity.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {INCLUDED_FEATURES.map((feat, i) => (
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

// ─── Comparison Table ─────────────────────────────────────────────────────────

function CheckMark() {
  return <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />;
}

function Dash() {
  return <span className="text-muted-foreground/60 text-lg mx-auto block text-center">—</span>;
}

const TABLE_ROWS = [
  {
    feature: "Monthly price",
    starter: "$19.99",
    professional: "$49",
    enterprise: "$99",
    type: "text" as const,
  },
  {
    feature: "Bank accounts",
    starter: "1",
    professional: "5",
    enterprise: "Unlimited",
    type: "text" as const,
  },
  {
    feature: "Transactions",
    starter: "Up to 500/month",
    professional: "Unlimited",
    enterprise: "Unlimited",
    type: "text" as const,
  },
  {
    feature: "Financial reports",
    starter: "Standard",
    professional: "Advanced reports & analytics",
    enterprise: "Custom reports",
    type: "text" as const,
  },
  {
    feature: "Donor tracking",
    starter: true,
    professional: true,
    enterprise: true,
    type: "check" as const,
  },
  {
    feature: "Opening balances wizard",
    starter: true,
    professional: true,
    enterprise: true,
    type: "check" as const,
  },
  {
    feature: "Bank reconciliation",
    starter: false,
    professional: true,
    enterprise: true,
    type: "mixed" as const,
  },
  {
    feature: "Period close tool",
    starter: false,
    professional: true,
    enterprise: true,
    type: "mixed" as const,
  },
  {
    feature: "990 reporting tool",
    starter: false,
    professional: true,
    enterprise: true,
    type: "mixed" as const,
  },
  {
    feature: "Plaid bank sync",
    starter: true,
    professional: true,
    enterprise: true,
    type: "check" as const,
  },
  {
    feature: "User access",
    starter: "Single-team basic use",
    professional: "Multi-user access",
    enterprise: "Unlimited users",
    type: "text" as const,
  },
  {
    feature: "Multi-org management",
    starter: false,
    professional: false,
    enterprise: true,
    type: "mixed" as const,
  },
  {
    feature: "API access",
    starter: false,
    professional: false,
    enterprise: true,
    type: "mixed" as const,
  },
  {
    feature: "Support",
    starter: "Email support",
    professional: "Priority support",
    enterprise: "Dedicated support",
    type: "text" as const,
  },
];

function renderCell(value: string | boolean) {
  if (value === true) return <CheckMark />;
  if (value === false) return <Dash />;
  return <span className="text-sm text-foreground">{value}</span>;
}

function ComparisonTableSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Plan comparison</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Compare plans side by side to find the right fit for your organization's current needs.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left py-4 px-6 font-semibold text-foreground w-1/3">Feature</th>
                <th className="text-center py-4 px-4 font-semibold text-foreground">Starter</th>
                <th className="text-center py-4 px-4 font-semibold text-primary">
                  <span className="inline-flex flex-col items-center gap-1">
                    Professional
                    <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                      Most Popular
                    </span>
                  </span>
                </th>
                <th className="text-center py-4 px-4 font-semibold text-foreground">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-border last:border-b-0 ${
                    i % 2 === 0 ? "bg-background" : "bg-card"
                  }`}
                >
                  <td className="py-4 px-6 font-medium text-foreground">{row.feature}</td>
                  <td className="py-4 px-4 text-center text-muted-foreground">
                    {renderCell(row.starter)}
                  </td>
                  <td className="py-4 px-4 text-center text-muted-foreground bg-primary/5">
                    {renderCell(row.professional)}
                  </td>
                  <td className="py-4 px-4 text-center text-muted-foreground">
                    {renderCell(row.enterprise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Who Each Plan Is For ─────────────────────────────────────────────────────

const WHO_FOR = [
  {
    plan: "Starter",
    price: "$19.99/mo",
    description:
      "Best for very small nonprofits, churches, or associations that want a simpler way to manage core accounting, donor tracking, and setup without relying on spreadsheets.",
    popular: false,
  },
  {
    plan: "Professional",
    price: "$49/mo",
    description:
      "Best for growing teams that need more reporting depth, bank reconciliation, period close workflows, 990 support, and collaboration.",
    popular: true,
  },
  {
    plan: "Enterprise",
    price: "$99/mo",
    description:
      "Best for organizations with multiple entities, more advanced reporting needs, API requirements, or larger finance teams that need flexibility and support.",
    popular: false,
  },
];

function WhoForSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">Which plan should you choose?</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Each plan is designed for a different stage of organizational complexity.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {WHO_FOR.map((item, i) => (
            <div
              key={i}
              className={`relative rounded-2xl border p-8 shadow-sm hover:shadow-md transition-all ${
                item.popular
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-card"
              }`}
            >
              {item.popular && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full shadow">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-bold mb-1">{item.plan}</h3>
              <p className="text-sm text-muted-foreground mb-4">{item.price}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              <div className="mt-6">
                <Link href="/register">
                  <Button
                    className="w-full"
                    variant={item.popular ? "default" : "outline"}
                  >
                    Start free trial
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Why Pricing Works for Nonprofits ────────────────────────────────────────

const WHY_PRICING = [
  {
    icon: Target,
    title: "Start small",
    body: "Choose a plan that matches where your organization is today. No need to pay for features you don't yet need.",
  },
  {
    icon: TrendingUp,
    title: "Grow without friction",
    body: "Upgrade when you need more reporting depth, stronger close workflows, more users, or greater organizational complexity.",
  },
  {
    icon: Zap,
    title: "Stay focused on the mission",
    body: "Simple pricing helps teams budget confidently without navigating complicated enterprise packaging.",
  },
];

function WhyPricingSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Why our pricing works for nonprofits
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Many mission-driven organizations need stronger accounting tools but cannot justify
            enterprise software cost or complexity. MissionLedger is designed to give nonprofits,
            churches, and associations a more purpose-built financial workflow — including donor
            tracking, 990 reporting support, cleaner month-end processes, and guided setup — with
            pricing that stays straightforward and accessible.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {WHY_PRICING.map((item, i) => (
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

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Is there a free trial?",
    a: "Yes. All plans include a free trial and no credit card is required to get started.",
  },
  {
    q: "Which plan is best for a small nonprofit?",
    a: "Starter is a strong fit for very small organizations, while Professional is better for growing teams that need more reporting, donor tracking, structured month-end workflows, and 990 support.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can start with the plan that fits today and move up as your organization's needs grow.",
  },
  {
    q: "Which plans include donor tracking?",
    a: "Donor tracking is included across MissionLedger plans.",
  },
  {
    q: "Which plans include 990 reporting?",
    a: "The 990 reporting tool is included in Professional and Enterprise.",
  },
  {
    q: "Which plans include period close workflows?",
    a: "The period close tool is included in Professional and Enterprise.",
  },
  {
    q: "Which plans include the opening balances wizard?",
    a: "The opening balances wizard is included to help organizations get started with cleaner setup and migration workflows.",
  },
  {
    q: "Which plan includes API access?",
    a: "API access is included with the Enterprise plan.",
  },
  {
    q: "Is MissionLedger built specifically for nonprofits?",
    a: "Yes. MissionLedger is designed for nonprofits, churches, and associations that need fund accounting, donor tracking, nonprofit-friendly reporting, and stronger financial workflows.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            Frequently asked questions
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

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCtaSection() {
  return (
    <section className="py-24 bg-primary text-primary-foreground">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-extrabold mb-6">
          Choose a simpler path to nonprofit financial clarity
        </h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
          Start your free trial today or book a demo to find the right MissionLedger plan for your
          organization.
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <PricingCardsSection />
        <WhatsIncludedSection />
        <ComparisonTableSection />
        <WhoForSection />
        <WhyPricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
