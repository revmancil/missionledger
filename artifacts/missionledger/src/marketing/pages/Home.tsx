/**
 * Home — the redesigned marketing landing page.
 */
import * as React from "react";
import {
  ArrowRight,
  Check,
  Sparkles,
  Layers,
  Users,
  FileText,
  ShieldCheck,
  Star,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigate } from "../nav";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  IconTile,
  CtaButtons,
  Pill,
  Brand,
} from "../ui";
import {
  ORG_TYPES,
  FEATURES,
  HERO_STATS,
  SCREENSHOTS,
  TRUST_BADGES,
  PLANS,
  FAQS,
} from "../data";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

/* ─────────────────────────────── Hero ─────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 sm:pt-20 sm:pb-28">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
      <div className="pointer-events-none absolute inset-0 -z-10 ml-grid opacity-60" />

      <Container>
        <Reveal>
          <div className="flex justify-center">
            <Brand className="h-28 w-auto drop-shadow-sm sm:h-32 lg:h-40" />
          </div>
        </Reveal>

        <div className="mt-12 grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal delay={40}>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Built for nonprofits, churches & associations
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Nonprofit accounting that finally speaks{" "}
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                  your organization's language
                </span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Fund accounting, donor giving, 990 prep, bank reconciliation, and
                a guided month-end close — in one purpose-built system. Choose
                your org type and MissionLedger scaffolds the right chart of
                accounts from day one.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <CtaButtons className="mt-9" />
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-accent" />
                Free trial on every plan. No credit card required.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <dl className="mt-10 grid max-w-lg grid-cols-4 gap-4 border-t border-border/70 pt-6">
                {HERO_STATS.map((s) => (
                  <div key={s.label}>
                    <dt className="text-2xl font-bold text-foreground">{s.value}</dt>
                    <dd className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Product mock */}
          <Reveal delay={160} className="relative">
            <HeroMock />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function HeroMock() {
  const bars = [44, 62, 38, 74, 56, 84, 68];
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-transparent to-accent/15 blur-2xl" />

      <div className="rounded-2xl border border-border bg-card/90 p-3 shadow-2xl shadow-primary/10 backdrop-blur">
        <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-chart-3/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          <span className="ml-3 text-[11px] font-medium text-muted-foreground">
            missionledger.app / dashboard
          </span>
        </div>

        <div className="rounded-xl border border-border/70 bg-background p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Total cash
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">$284,910</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              +4.2% MoM
            </span>
          </div>

          <div className="mt-5 flex h-28 items-end gap-2">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-primary/70 to-accent/70"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "Restricted", value: "$96,400" },
              { label: "Unrestricted", value: "$188,510" },
              { label: "Budget used", value: "61%" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/70 bg-card p-3">
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating chips */}
      <div className="ml-float absolute -left-5 top-24 hidden rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:block">
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          Fund balance updated
        </p>
      </div>
      <div
        className="ml-float absolute -right-4 bottom-20 hidden rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:block"
        style={{ animationDelay: "1.2s" }}
      >
        <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" />
          Period locked
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Trust marquee ─────────────────────────── */

function TrustMarquee() {
  const items = [...TRUST_BADGES, ...TRUST_BADGES];
  return (
    <div className="border-y border-border bg-card/60 py-6">
      <div className="relative overflow-hidden">
        <div className="ml-marquee gap-4">
          {items.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              <Check className="h-4 w-4 text-primary" />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Why ──────────────────────────────── */

function Why() {
  return (
    <Section>
      <SectionHeading
        eyebrow="Why MissionLedger"
        title="Generic accounting software was never designed to run a mission"
        subtitle="QuickBooks and spreadsheets treat restricted funds, donor giving, and board reporting as afterthoughts. MissionLedger treats them as the whole point."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {[
          {
            icon: Layers,
            title: "Funds, not workarounds",
            body: "Restricted and unrestricted money stays cleanly separated — with balances that update the moment a gift or expense posts.",
          },
          {
            icon: Users,
            title: "Giving next to the ledger",
            body: "Donations, pledges, and giving history live beside the accounting entries they create, so finance and fundraising stay in sync.",
          },
          {
            icon: ShieldCheck,
            title: "A close you can defend",
            body: "A guided period close, opening-balance wizard, and immutable audit logs give you the structure to finish each month with confidence.",
          },
        ].map((c, i) => (
          <Reveal key={c.title} delay={i * 80}>
            <div className="ml-lift group h-full rounded-2xl border border-border bg-card p-7 shadow-sm">
              <IconTile icon={c.icon} />
              <h3 className="mt-5 text-lg font-bold text-foreground">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {c.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ────────────────────────────── Org types ─────────────────────────── */

function OrgTypes() {
  return (
    <Section id="org-types" className="bg-card">
      <SectionHeading
        eyebrow="Tailored from the first login"
        title="One platform, tuned to how your organization actually works"
        subtitle="Pick your org type at signup and MissionLedger seeds the right chart of accounts, terminology, and reports — no generic template to untangle."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {ORG_TYPES.map((org, i) => (
          <Reveal key={org.id} delay={i * 80}>
            <div className="ml-lift group relative h-full overflow-hidden rounded-2xl border border-border bg-background p-7 shadow-sm">
              <div className="absolute right-5 top-5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                {org.tag}
              </div>
              <IconTile icon={org.icon} size="lg" />
              <h3 className="mt-5 text-xl font-bold text-foreground">
                {org.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {org.body}
              </p>
              <ul className="mt-5 space-y-2.5 border-t border-border/70 pt-5">
                {org.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────── Feature bento ───────────────────────── */

function FeatureBento() {
  const shown = FEATURES.slice(0, 6);
  return (
    <Section>
      <SectionHeading
        eyebrow="The essentials, done properly"
        title="Everything you need to manage your mission"
        subtitle="A complete nonprofit finance stack — not a bundle of disconnected add-ons."
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 70}>
            <div className="ml-lift group h-full rounded-2xl border border-border bg-card p-6 shadow-sm">
              <IconTile icon={f.icon} />
              <h3 className="mt-5 text-base font-bold text-foreground">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-10 flex justify-center">
        <Button
          variant="outline"
          size="lg"
          className="h-12 gap-2 bg-card px-7"
          onClick={() => navigate("features")}
        >
          Explore all features
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Section>
  );
}

/* ─────────────────────────── Screenshot tour ──────────────────────── */

function ScreenshotTour() {
  const [active, setActive] = React.useState(0);
  const current = SCREENSHOTS[active];

  return (
    <Section className="bg-card">
      <SectionHeading
        eyebrow="See it in action"
        title="Built to make month-end feel calmer"
        subtitle="Real screens from MissionLedger — from fund balances to board-ready reports."
      />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-xl shadow-primary/5">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-chart-3/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
            <span className="ml-3 text-xs font-medium text-muted-foreground">
              {current.label}
            </span>
          </div>
          <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              key={current.src}
              src={`${import.meta.env.BASE_URL}${current.src.replace(/^\//, "")}`}
              alt={current.label}
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>
      </Reveal>

      <div className="ml-no-scrollbar mt-6 flex gap-3 overflow-x-auto pb-1">
        {SCREENSHOTS.map((s, i) => (
          <button
            key={s.src}
            onClick={() => setActive(i)}
            className={cn(
              "flex-shrink-0 rounded-xl border px-4 py-3 text-left transition-all",
              i === active
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border bg-background hover:border-primary/40",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">
              {s.label}
            </span>
            <span className="mt-0.5 block max-w-[15rem] text-xs text-muted-foreground">
              {s.caption}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ──────────────────────────── Testimonials ────────────────────────── */

function Testimonials() {
  const quotes = [
    {
      quote:
        "We finally stopped rebuilding fund balances in a spreadsheet every month. Board packets take an afternoon instead of a week.",
      name: "Executive Director",
      org: "Regional hunger-relief nonprofit",
    },
    {
      quote:
        "Tithes, designated gifts, and our building fund all track cleanly — and our finance team actually understands the reports.",
      name: "Church Administrator",
      org: "Multi-site congregation",
    },
    {
      quote:
        "Dues and events for twelve chapters used to be a nightmare. Now it's one ledger and a board report I can trust.",
      name: "Treasurer",
      org: "State membership association",
    },
  ];
  return (
    <Section>
      <SectionHeading
        eyebrow="Trusted by lean finance teams"
        title="Built for the people who actually close the books"
      />
      <div className="grid gap-6 md:grid-cols-3">
        {quotes.map((q, i) => (
          <Reveal key={i} delay={i * 80}>
            <figure className="ml-lift flex h-full flex-col rounded-2xl border border-border bg-card p-7 shadow-sm">
              <div className="flex gap-0.5 text-chart-3">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                "{q.quote}"
              </blockquote>
              <figcaption className="mt-5 border-t border-border/70 pt-4">
                <p className="text-sm font-semibold text-foreground">{q.name}</p>
                <p className="text-xs text-muted-foreground">{q.org}</p>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ───────────────────────── Pricing preview ────────────────────────── */

function PricingPreview() {
  return (
    <Section id="pricing" className="bg-card">
      <SectionHeading
        eyebrow="Simple pricing"
        title="Flat monthly pricing, no per-transaction fees"
        subtitle="Start with the essentials and upgrade as your organization grows. A free trial is included on every plan."
      />
      <div className="grid items-start gap-6 md:grid-cols-3">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 80}>
            <div
              className={cn(
                "ml-lift relative flex h-full flex-col rounded-2xl border bg-background p-7 shadow-sm",
                plan.popular
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-border",
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-primary-foreground shadow">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{plan.blurb}</p>
              <p className="mt-4 text-4xl font-extrabold text-foreground">
                {plan.price}
                <span className="text-base font-normal text-muted-foreground">
                  {plan.period}
                </span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.slice(0, 6).map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.popular ? "default" : "outline"}
                className="mt-7 h-11 w-full"
                onClick={() => navigate("pricing")}
              >
                {plan.cta}
              </Button>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate("pricing")}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          Compare every plan in detail
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </Section>
  );
}

/* ─────────────────────────────── FAQ ──────────────────────────────── */

function Faq() {
  return (
    <Section id="faq">
      <SectionHeading
        eyebrow="Questions, answered"
        title="What organizations ask before they switch"
      />
      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

/* ──────────────────────────── Final CTA ───────────────────────────── */

function FinalCta() {
  return (
    <section id="signup" className="relative scroll-mt-24 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-primary" />
      <div className="absolute inset-0 -z-10 ml-glow opacity-70" />
      <Container className="py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center text-primary-foreground">
          <Pill className="border-white/20 bg-white/10 text-white">
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            Free trial — no credit card
          </Pill>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Give your mission the books it deserves
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed opacity-90">
            Try MissionLedger free and see how much simpler fund accounting,
            donor giving, and month-end close can be when the software is built
            for organizations like yours.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-12 gap-2 bg-primary-foreground px-8 text-base text-primary hover:bg-primary-foreground/90"
              onClick={() => navigate("home")}
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-white/30 bg-transparent px-8 text-base text-white hover:bg-white/10 hover:text-white"
              onClick={() => navigate("pricing")}
            >
              Book a demo
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ─────────────────────────── Page assembly ────────────────────────── */

export default function Home() {
  return (
    <>
      <Hero />
      <TrustMarquee />
      <Why />
      <OrgTypes />
      <FeatureBento />
      <ScreenshotTour />
      <Testimonials />
      <PricingPreview />
      <Faq />
      <FinalCta />
    </>
  );
}
