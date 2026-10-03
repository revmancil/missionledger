/**
 * About — mission, story, principles, and who we serve.
 */
import * as React from "react";
import {
  Compass,
  Heart,
  Users,
  Scale,
  Eye,
  Target,
  Building2,
  Church,
  HeartHandshake,
  ArrowRight,
} from "lucide-react";
import { navigate } from "../nav";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  IconTile,
  Pill,
} from "../ui";
import { Button } from "@/components/ui/button";
import { ORG_TYPES } from "../data";

const PRINCIPLES = [
  {
    icon: Compass,
    title: "Purpose over parity",
    body: "We don't chase feature checklists built for for-profit businesses. Every decision starts with how nonprofit, church, and association finance actually works.",
  },
  {
    icon: Scale,
    title: "Clarity over complexity",
    body: "Guided workflows, plain labels, and structured processes mean you don't need an accountant on staff to keep clean books.",
  },
  {
    icon: Users,
    title: "Stewardship over stunts",
    body: "We build for the treasurer, the bookkeeper, and the board — the people accountable for every dollar entrusted to the mission.",
  },
  {
    icon: Heart,
    title: "Trust is the product",
    body: "Immutable audit logs, strict access controls, and transparent pricing aren't add-ons. They're the reason organizations can rely on us.",
  },
];

const STORY = [
  {
    icon: Eye,
    title: "The problem we kept seeing",
    body: "Mission-driven organizations were forcing for-profit accounting software to do nonprofit work — rebuilding fund balances in spreadsheets, stitching donor records to the ledger by hand, and bracing for a messy audit every year.",
  },
  {
    icon: Target,
    title: "What we set out to build",
    body: "A single system where funds, giving, reporting, and close live together, pre-configured for the kind of organization you are — nonprofit, church, or association — from the very first login.",
  },
  {
    icon: Compass,
    title: "Where we're headed",
    body: "Deepening what makes each org type genuinely different: church contribution and designated-gift workflows, association dues and chapter accounting, and nonprofit grant and functional-expense reporting.",
  },
];

export default function About() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Pill className="border-primary/20 bg-primary/10 text-primary">
                About MissionLedger
              </Pill>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                Financial software built for people doing good work
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                We build for the organizations that hold money in trust — and for
                the small finance teams who have to answer for it. MissionLedger
                gives them accounting software that already understands the way
                they operate.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Mission statement band */}
      <Section className="pt-0">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-primary px-8 py-12 text-center text-primary-foreground sm:px-14">
            <div className="absolute inset-0 ml-glow opacity-60" />
            <div className="relative mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-widest opacity-80">
                Our mission
              </p>
              <p className="mt-4 text-2xl font-bold leading-snug sm:text-3xl">
                To make trustworthy financial stewardship achievable for every
                mission-driven organization — regardless of the size of its
                finance team.
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* Story */}
      <Section className="pt-0">
        <SectionHeading
          eyebrow="Our story"
          title="Why we built MissionLedger"
          align="left"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {STORY.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div className="ml-lift h-full rounded-2xl border border-border bg-card p-7 shadow-sm">
                <IconTile icon={s.icon} />
                <h3 className="mt-5 text-lg font-bold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Principles */}
      <Section className="bg-card">
        <SectionHeading
          eyebrow="What we believe"
          title="Principles that shape every release"
        />
        <div className="grid gap-6 sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 70}>
              <div className="ml-lift flex h-full gap-5 rounded-2xl border border-border bg-background p-7 shadow-sm">
                <IconTile icon={p.icon} size="lg" className="flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Who we serve */}
      <Section>
        <SectionHeading
          eyebrow="Who we build for"
          title="Three kinds of organizations, one trusted system"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {ORG_TYPES.map((org, i) => (
            <Reveal key={org.id} delay={i * 80}>
              <div className="ml-lift h-full rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
                <IconTile icon={org.icon} size="lg" className="mx-auto" />
                <h3 className="mt-5 text-lg font-bold text-foreground">
                  {org.label}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {org.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="pt-0">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-wrap justify-center gap-6 text-muted-foreground">
            {[
              { icon: Building2, label: "Nonprofits" },
              { icon: Church, label: "Churches" },
              { icon: HeartHandshake, label: "Associations" },
            ].map((x) => (
              <span key={x.label} className="inline-flex items-center gap-2 text-sm font-medium">
                <x.icon className="h-4 w-4 text-primary" />
                {x.label}
              </span>
            ))}
          </div>
          <Button
            size="lg"
            className="h-12 gap-2 px-7"
            onClick={() => navigate("home", "signup")}
          >
            Start your free trial
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Section>
    </>
  );
}
