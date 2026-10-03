/**
 * Features — grouped capability detail page.
 */
import * as React from "react";
import { ArrowRight, Check, Layers, CalendarCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigate } from "../nav";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  IconTile,
  CtaButtons,
  Pill,
} from "../ui";
import { FEATURES, FEATURE_GROUPS, type Feature } from "../data";

const GROUP_META: Record<
  Feature["group"],
  { icon: React.ComponentType<{ className?: string }>; blurb: string }
> = {
  Accounting: {
    icon: Layers,
    blurb:
      "The core ledger built for fund accounting — not a for-profit system wearing a nonprofit label.",
  },
  Giving: {
    icon: Users,
    blurb:
      "Donor and member relationships that stay connected to the money they generate.",
  },
  "Close & Controls": {
    icon: CalendarCheck,
    blurb:
      "Structure, locks, and an audit trail so month-end is predictable and defensible.",
  },
};

const DEEP_DIVES = [
  {
    title: "Fund accounting that maps to how you operate",
    body: "Create unlimited funds — general operating, restricted grants, designated gifts, capital campaigns, endowments — each flagged restricted or unrestricted. Balances update in real time and fund-level reports are one click away.",
    points: [
      "Restricted vs. unrestricted net assets",
      "Fund-to-account allocation on every post",
      "Fund ledger with running balance",
      "Fund-level statement of activities",
    ],
  },
  {
    title: "Giving and the general ledger, finally aligned",
    body: "When a gift arrives, MissionLedger records it in the ledger and the donor record simultaneously. Track pledges, recurring gifts, and giving history without ever leaving the financial system.",
    points: [
      "Donor & giver directory with profiles",
      "Pledges and multi-year campaigns",
      "Year-end contribution statements",
      "Giving history tied to ledger entries",
    ],
  },
  {
    title: "Reporting your board can actually read",
    body: "Statement of Activities, Statement of Financial Position, General Ledger, General Journal, Trial Balance, and custom reports — plus a one-click board packet with fund and budget context.",
    points: [
      "4-tab reporting suite, GL-sourced",
      "Budget vs. actual with alerts",
      "900-friendly expense allocation",
      "Export to CSV or PDF",
    ],
  },
  {
    title: "A close process with guardrails",
    body: "Run a pre-close health check, reconcile accounts, soft-lock the period, roll forward at year end, and keep an immutable record of every reopen with a required reason.",
    points: [
      "Pre-close health check",
      "Period soft-lock & year-end hard close",
      "Immutable audit logs",
      "Role-based access controls",
    ],
  },
];

export default function Features() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Pill className="border-primary/20 bg-primary/10 text-primary">
                Features
              </Pill>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                A complete nonprofit finance stack
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                Every tool you need to run the books for a mission-driven
                organization — accounting, giving, close, and controls, built to
                work together from day one.
              </p>
            </Reveal>
            <Reveal delay={180}>
              <CtaButtons className="mt-8 justify-center" />
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Grouped capability grid */}
      <Section className="pt-4">
        <div className="space-y-16">
          {FEATURE_GROUPS.map((group, gi) => {
            const meta = GROUP_META[group];
            const items = FEATURES.filter((f) => f.group === group);
            return (
              <div key={group}>
                <div className="flex items-start gap-4">
                  <IconTile icon={meta.icon} size="lg" />
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{group}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {meta.blurb}
                    </p>
                  </div>
                </div>
                <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((f, i) => (
                    <Reveal key={f.title} delay={(i % 3) * 70}>
                      <div className="ml-lift group h-full rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center gap-3">
                          <IconTile icon={f.icon} size="sm" />
                          <h3 className="text-base font-bold text-foreground">
                            {f.title}
                          </h3>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                          {f.body}
                        </p>
                      </div>
                    </Reveal>
                  ))}
                </div>
                {gi < FEATURE_GROUPS.length - 1 ? (
                  <div className="mt-16 h-px w-full bg-border" />
                ) : null}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Deep dives */}
      <Section id="deep-dive" className="bg-card">
        <SectionHeading
          eyebrow="Go a level deeper"
          title="How MissionLedger handles the hard parts"
        />
        <div className="space-y-8">
          {DEEP_DIVES.map((d, i) => (
            <Reveal key={d.title} delay={i * 60}>
              <div className="grid items-center gap-8 rounded-2xl border border-border bg-background p-7 lg:grid-cols-2 lg:p-9">
                <div className={i % 2 !== 0 ? "lg:order-2" : ""}>
                  <h3 className="text-xl font-bold text-foreground">{d.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {d.body}
                  </p>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {d.points.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-2 rounded-xl border border-border/70 bg-card p-3 text-sm text-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Org-type deep link */}
      <Section id="org-types">
        <SectionHeading
          eyebrow="Tailored to your org type"
          title="The same platform — tuned to nonprofits, churches, and associations"
          subtitle="Your chart of accounts, terminology, and statement language adjust to the organization type you choose."
        />
        <div className="flex justify-center">
          <Button
            size="lg"
            className="h-12 gap-2 px-7"
            onClick={() => navigate("pricing")}
          >
            See how it fits your organization
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Section>
    </>
  );
}
