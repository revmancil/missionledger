import { Link } from "wouter";
import {
  ArrowRight,
  Layers,
  Heart,
  BarChart3,
  Shield,
  Users,
  Building2,
  CheckCircle2,
  Zap,
  Eye,
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
          className="text-sm font-medium text-foreground transition-colors"
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
          Built to bring financial clarity to{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            mission-driven organizations
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          MissionLedger exists to help nonprofits, churches, and associations manage accounting,
          donor activity, and financial reporting in a system built for the way mission-driven
          organizations actually operate.
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
          Purpose-built for nonprofits, churches, and associations.
        </p>
      </div>
    </section>
  );
}

// ─── Why We Built MissionLedger ───────────────────────────────────────────────

function WhyWeBuiltSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-8">Why we built MissionLedger</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Most accounting software was built for for-profit businesses. Mission-driven organizations
          often end up adapting those tools with spreadsheets, workarounds, and disconnected systems
          just to manage restricted funds, donor activity, and board reporting. MissionLedger was
          created to offer a simpler, more purpose-built path to nonprofit financial management.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          We believe nonprofits, churches, and associations should not have to choose between
          software that is too generic to fit their workflows and software that is too expensive or
          complex to adopt comfortably. MissionLedger is designed to make financial stewardship
          clearer, more manageable, and more aligned with the needs of mission-driven teams.
        </p>
      </div>
    </section>
  );
}

// ─── Who We Serve ─────────────────────────────────────────────────────────────

const WHO_WE_SERVE = [
  {
    icon: Building2,
    title: "Nonprofits",
    body: "For organizations that need fund accounting, donor visibility, and reporting that supports boards, finance committees, and leadership.",
  },
  {
    icon: Heart,
    title: "Churches",
    body: "For churches that need a clearer way to manage donations, funds, financial oversight, and mission-focused operations.",
  },
  {
    icon: Users,
    title: "Associations",
    body: "For associations that need organized financial workflows, collaboration, and stronger reporting visibility across the organization.",
  },
];

function WhoWeServeSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold">Who MissionLedger is built for</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            MissionLedger is designed for organizations that need financial tools built around
            stewardship, accountability, and operational clarity.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {WHO_WE_SERVE.map((card, i) => (
            <div
              key={i}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
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

// ─── What Makes MissionLedger Different ──────────────────────────────────────

const DIFFERENTIATORS = [
  {
    icon: Layers,
    title: "Built for nonprofit workflows",
    body: "MissionLedger is designed around fund accounting, donor-related records, and nonprofit financial visibility instead of asking organizations to adapt a generic business accounting system.",
  },
  {
    icon: Shield,
    title: "Clearer financial stewardship",
    body: "The platform is designed to help organizations maintain cleaner books, stronger oversight, and more useful reporting for internal and external stakeholders.",
  },
  {
    icon: Zap,
    title: "Simpler for lean teams",
    body: "MissionLedger is built for teams that need strong financial tools without the cost, complexity, or overhead of enterprise software.",
  },
  {
    icon: BarChart3,
    title: "Transparent pricing",
    body: "Straightforward monthly pricing helps organizations choose a fit that works for their size and stage.",
  },
];

function DifferentiatorsSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">What makes MissionLedger different</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-8">
          {DIFFERENTIATORS.map((item, i) => (
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

// ─── Our Approach ─────────────────────────────────────────────────────────────

const APPROACH_VALUES = [
  {
    icon: Eye,
    title: "Clarity",
    body: "Make financial information easier to understand and act on.",
  },
  {
    icon: Shield,
    title: "Stewardship",
    body: "Support stronger accountability for funds, donors, and decision-making.",
  },
  {
    icon: CheckCircle2,
    title: "Practicality",
    body: "Give teams tools they can actually adopt and use without enterprise-level overhead.",
  },
];

function OurApproachSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold mb-6">Our approach to product design</h2>
          <p className="text-muted-foreground leading-relaxed">
            MissionLedger is built around a simple idea: financial software for mission-driven
            organizations should feel clear, trustworthy, and practical. The product is designed to
            support real nonprofit workflows — from fund tracking and donor management to
            reconciliation, reporting, and oversight — without unnecessary complexity.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {APPROACH_VALUES.map((val, i) => (
            <div
              key={i}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 mx-auto group-hover:scale-110 transition-transform">
                <val.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-2">{val.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{val.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── What MissionLedger Helps You Do ─────────────────────────────────────────

const CAPABILITIES = [
  "Track restricted and unrestricted funds more clearly",
  "Manage donor records, pledges, and recurring donations in one place",
  "Reconcile bank activity with a cleaner month-end workflow",
  "Generate clearer reports for leadership and oversight",
  "Strengthen internal controls with permissions and audit logs",
  "Support growth from simple setups to more advanced organizational needs",
];

function CapabilitiesSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">
            What MissionLedger helps organizations do
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {CAPABILITIES.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust / Credibility ──────────────────────────────────────────────────────

const TRUST_CARDS = [
  {
    title: "Purpose-built for mission-driven teams",
    body: "The product is focused specifically on nonprofits, churches, and associations.",
  },
  {
    title: "Designed for oversight",
    body: "Features like permissions, audit logs, and period-close workflows support stronger control and accountability.",
  },
  {
    title: "Accessible for smaller organizations",
    body: "MissionLedger aims to give smaller and growing teams a more manageable alternative to generic tools and heavyweight enterprise systems.",
  },
];

function TrustSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold mb-6">
            Built for organizations that need trust as much as they need tools
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Financial software for mission-driven organizations must support both day-to-day
            usability and confidence in the numbers. MissionLedger is designed to help organizations
            operate with greater clarity, stronger oversight, and simpler financial workflows.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {TRUST_CARDS.map((card, i) => (
            <div
              key={i}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all"
            >
              <h3 className="font-bold mb-3">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Mission / Values ─────────────────────────────────────────────────────────

const VALUES = [
  {
    icon: Target,
    title: "Mission-driven organizations deserve purpose-built tools",
    body: "Nonprofits, churches, and associations have financial workflows that deserve more than workarounds.",
  },
  {
    icon: BarChart3,
    title: "Financial clarity supports better decisions",
    body: "Clear reporting and stronger visibility help teams lead, steward resources, and serve more effectively.",
  },
  {
    icon: Zap,
    title: "Software should reduce friction, not add it",
    body: "Good financial software should make month-end, reporting, and oversight feel more manageable.",
  },
];

function ValuesSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-display font-bold">What we believe</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {VALUES.map((val, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <val.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-3 leading-snug">{val.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{val.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Explore the Product ──────────────────────────────────────────────────────

function ExploreSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-6">See how MissionLedger works</h2>
        <p className="text-muted-foreground leading-relaxed mb-10">
          If your organization needs simpler nonprofit accounting, donor management, and financial
          reporting, explore the product and see how MissionLedger is built to support
          mission-driven teams.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/features">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
              View features
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
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
    a: "Yes. MissionLedger is designed for nonprofits, churches, and associations that need fund accounting, donor management, and nonprofit-friendly financial reporting.",
  },
  {
    q: "Is MissionLedger only for nonprofits?",
    a: "MissionLedger is built for mission-driven organizations, especially nonprofits, churches, and associations that need workflows designed around stewardship and accountability.",
  },
  {
    q: "Why not just use generic accounting software?",
    a: "Generic accounting tools can work for some organizations, but mission-driven teams often need nonprofit-specific workflows like fund visibility, donor-linked records, and clearer reporting for boards and oversight.",
  },
  {
    q: "Can I try MissionLedger before committing?",
    a: "Yes. MissionLedger offers a free trial with no credit card required.",
  },
  {
    q: "Where can I learn more about features and pricing?",
    a: "You can explore the Features and Pricing pages to see how MissionLedger supports organizations at different stages and levels of complexity.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="py-24 bg-card border-y border-border">
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
          Built for financial clarity. Designed for your mission.
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

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <WhyWeBuiltSection />
        <WhoWeServeSection />
        <DifferentiatorsSection />
        <OurApproachSection />
        <CapabilitiesSection />
        <TrustSection />
        <ValuesSection />
        <ExploreSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
