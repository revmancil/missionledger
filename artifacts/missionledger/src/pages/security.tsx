import { Link } from "wouter";
import {
  ArrowRight,
  Lock,
  FileText,
  Eye,
  Shield,
  Users,
  CalendarCheck,
  UserCheck,
  CheckCircle2,
  Search,
  Heart,
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
          Security and oversight for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            mission-driven financial workflows
          </span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          MissionLedger is designed to help nonprofits, churches, and associations manage financial
          data with stronger visibility, controlled access, and clearer auditability.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="h-14 px-8 text-base shadow-xl shadow-primary/25 group">
              Book a demo
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/register">
            <Button size="lg" variant="outline" className="h-14 px-8 text-base bg-card/50 backdrop-blur">
              Start free trial
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Built for mission-driven organizations that need trust as much as they need tools.
        </p>
      </div>
    </section>
  );
}

// ─── Security Philosophy ──────────────────────────────────────────────────────

function PhilosophySection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-8">Our approach to security</h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Financial software for mission-driven organizations must support both usability and trust.
          MissionLedger is designed to help teams manage accounting, donor activity, and reporting
          with stronger visibility, appropriate access controls, and clearer operational
          accountability.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          We believe security is not just about infrastructure. It is also about product design: who
          can access what, how changes are tracked, how financial workflows are reviewed, and how
          teams maintain confidence in the integrity of their records.
        </p>
      </div>
    </section>
  );
}

// ─── What This Page Helps You Understand ─────────────────────────────────────

const UNDERSTAND_CARDS = [
  {
    icon: Lock,
    title: "Access",
    body: "Help ensure the right people have the right level of visibility into financial workflows.",
  },
  {
    icon: FileText,
    title: "Auditability",
    body: "Support clearer accountability with logs and structured workflow visibility.",
  },
  {
    icon: Eye,
    title: "Oversight",
    body: "Give organizations stronger controls around review, reporting, and financial stewardship.",
  },
  {
    icon: Shield,
    title: "Trust",
    body: "Make security part of the product experience, not just a technical afterthought.",
  },
];

function UnderstandSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold">
            What this page is meant to help you understand
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            MissionLedger is built for organizations that need confidence in the way financial
            workflows are managed.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {UNDERSTAND_CARDS.map((card, i) => (
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

// ─── Product-Level Security Controls ─────────────────────────────────────────

const PRODUCT_CONTROLS = [
  {
    icon: Users,
    title: "Role-based access",
    body: "MissionLedger is designed to support role-based access so organizations can give team members the right level of visibility and responsibility.",
  },
  {
    icon: FileText,
    title: "Immutable audit logs",
    body: "Audit logs help teams understand changes and maintain clearer accountability over financial activity.",
  },
  {
    icon: CalendarCheck,
    title: "Period close workflows",
    body: "Structured close workflows help support cleaner review processes and reduce confusion at month-end.",
  },
  {
    icon: UserCheck,
    title: "Multi-user collaboration with control",
    body: "As organizations grow, MissionLedger is designed to support collaboration without losing visibility into who is doing what.",
  },
];

function ProductControlsSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold">Product-level controls</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            MissionLedger includes product features designed to support safer financial operations
            and clearer oversight.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-8">
          {PRODUCT_CONTROLS.map((item, i) => (
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

// ─── Access and Permissions ───────────────────────────────────────────────────

const ACCESS_BULLETS = [
  "Support role-appropriate access to financial workflows",
  "Reduce unnecessary visibility across users",
  "Help organizations maintain clearer accountability as teams grow",
];

function AccessSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-6">Access and permissions</h2>
        <p className="text-muted-foreground leading-relaxed mb-10">
          A strong security posture starts with access discipline. MissionLedger is designed to help
          organizations control who can view and manage financial information, so finance workflows
          remain organized and oversight remains clear.
        </p>

        <div className="flex flex-col gap-4 text-left">
          {ACCESS_BULLETS.map((item, i) => (
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

// ─── Auditability and Governance ──────────────────────────────────────────────

const AUDIT_CARDS = [
  {
    icon: Search,
    title: "Traceability",
    body: "Make it easier to understand changes and workflow activity.",
  },
  {
    icon: CheckCircle2,
    title: "Accountability",
    body: "Support cleaner handoffs, review processes, and operational ownership.",
  },
  {
    icon: Shield,
    title: "Stewardship",
    body: "Help finance teams and leadership operate with greater confidence in the integrity of the process.",
  },
];

function AuditSection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold mb-6">Auditability and governance</h2>
          <p className="text-muted-foreground leading-relaxed">
            For mission-driven organizations, trust depends on more than storing transactions. It
            also depends on being able to review activity, understand workflow history, and support
            internal accountability. MissionLedger is designed to help organizations maintain better
            visibility into how financial records are handled over time.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {AUDIT_CARDS.map((card, i) => (
            <div
              key={i}
              className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 mx-auto group-hover:scale-110 transition-transform">
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

// ─── Technical and Infrastructure Details ────────────────────────────────────

function TechnicalSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-6">
          Technical and infrastructure details
        </h2>
        <p className="text-muted-foreground leading-relaxed mb-6">
          Security evaluation often includes questions about hosting, encryption, backups, retention,
          authentication, and operational controls.
        </p>
        <p className="text-muted-foreground leading-relaxed mb-10">
          If your organization needs more detailed information about MissionLedger's technical
          security posture, please contact us for additional details. We aim to provide clear answers
          about product controls and operational practices as the platform evolves.
        </p>
        <Link href="/register">
          <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/20">
            Contact us
          </Button>
        </Link>
      </div>
    </section>
  );
}

// ─── Why Security Matters Differently for Nonprofits ─────────────────────────

const NONPROFIT_CARDS = [
  {
    icon: Heart,
    title: "Protect trust",
    body: "Financial clarity supports trust with boards, leaders, donors, and stakeholders.",
  },
  {
    icon: Eye,
    title: "Support oversight",
    body: "Controlled access and auditability help teams operate with stronger internal discipline.",
  },
  {
    icon: AlertCircle,
    title: "Reduce operational risk",
    body: "Clearer workflows can reduce confusion, improve review processes, and support cleaner reporting.",
  },
];

function NonprofitSecuritySection() {
  return (
    <section className="py-24 bg-card border-y border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold mb-6">
            Why security matters differently for mission-driven organizations
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Nonprofits, churches, and associations often operate with lean teams, multiple
            stakeholders, and a high need for financial trust. Security in this context is not only
            about preventing unauthorized access. It is also about enabling good stewardship, cleaner
            reporting, and stronger operational confidence across the organization.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {NONPROFIT_CARDS.map((card, i) => (
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

// ─── Transparent About What We Say ───────────────────────────────────────────

function TransparencySection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-display font-bold mb-6">Transparent about what we say</h2>
        <p className="text-muted-foreground leading-relaxed">
          MissionLedger aims to communicate security responsibly. We prefer clear, supportable
          statements over broad claims that cannot be verified. As the platform grows, this page can
          evolve to include more technical and compliance details where appropriate.
        </p>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "Does MissionLedger include role-based access?",
    a: "MissionLedger is designed to support role-based access so organizations can manage visibility and responsibility more clearly.",
  },
  {
    q: "Does MissionLedger keep audit logs?",
    a: "MissionLedger includes audit-log oriented controls to help organizations maintain clearer accountability over financial activity.",
  },
  {
    q: "Is MissionLedger built for nonprofits?",
    a: "Yes. MissionLedger is designed for nonprofits, churches, and associations that need accounting workflows with stronger stewardship, reporting clarity, and oversight.",
  },
  {
    q: "Where can I learn more about MissionLedger's security details?",
    a: "If your organization needs more detailed technical or security information, please contact us for additional details.",
  },
  {
    q: "Why does a nonprofit accounting platform need a security page?",
    a: "Financial workflows involve sensitive operational and accounting information, so organizations need confidence in both product controls and oversight practices.",
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
          Need more confidence in your financial workflow?
        </h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
          Book a demo or start a free trial to see how MissionLedger supports clearer oversight,
          access control, and financial stewardship.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register">
            <Button
              size="lg"
              className="h-14 px-8 text-base bg-primary-foreground text-primary hover:bg-primary-foreground/90 shadow-xl group"
            >
              Book a demo
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-base border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
            >
              Start free trial
            </Button>
          </Link>
        </div>
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

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <PhilosophySection />
        <UnderstandSection />
        <ProductControlsSection />
        <AccessSection />
        <AuditSection />
        <TechnicalSection />
        <NonprofitSecuritySection />
        <TransparencySection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
}
