/**
 * Compare — MissionLedger vs. generic accounting software.
 */
import * as React from "react";
import { Check, Minus, ArrowRight, Sparkles } from "lucide-react";
import { navigate } from "../nav";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  Pill,
  Brand,
} from "../ui";
import { Button } from "@/components/ui/button";
import { COMPARE_ROWS } from "../data";

function Value({ v, side }: { v: string | boolean; side: "ml" | "qb" }) {
  if (typeof v === "boolean") {
    return v ? (
      <Check
        className={`mx-auto h-5 w-5 ${side === "ml" ? "text-accent" : "text-muted-foreground"}`}
      />
    ) : (
      <Minus className="mx-auto h-5 w-5 text-muted-foreground/40" />
    );
  }
  return (
    <span
      className={`text-sm ${side === "ml" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
    >
      {v}
    </span>
  );
}

const REASONS = [
  {
    title: "Funds are native, not a workaround",
    body: "Restricted and unrestricted tracking is the core data model, not a class or a custom field you have to engineer yourself.",
  },
  {
    title: "Giving stays connected",
    body: "Donor records and the ledger share one source of truth, so finance and fundraising never diverge.",
  },
  {
    title: "Reporting built for boards",
    body: "Statements, schedules, and board packets are designed for nonprofit governance out of the box.",
  },
];

export default function Compare() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Pill className="border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Compare
              </Pill>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                MissionLedger vs. QuickBooks
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                QuickBooks is excellent software for businesses. But nonprofit
                finance has different rules — restricted funds, donor giving,
                board reporting, and Form 990. Here's how the two compare.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      <Section className="pt-4">
        <Reveal>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="p-4 text-sm font-semibold text-foreground">
                    Capability
                  </th>
                  <th className="p-4 text-center">
                    <span className="inline-flex items-center justify-center">
                      <Brand className="h-7" />
                    </span>
                  </th>
                  <th className="p-4 text-center text-sm font-semibold text-muted-foreground">
                    QuickBooks
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, ri) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border/60 last:border-0 ${
                      ri % 2 === 1 ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className="p-4 text-sm font-medium text-foreground">
                      {row.label}
                    </td>
                    <td className="bg-primary/[0.04] p-4 text-center">
                      <Value v={row.missionledger} side="ml" />
                    </td>
                    <td className="p-4 text-center">
                      <Value v={row.quickbooks} side="qb" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Comparison reflects typical out-of-box nonprofit use; competitor
          capabilities may vary by edition and configuration.
        </p>
      </Section>

      <Section className="bg-card">
        <SectionHeading
          eyebrow="Why teams switch"
          title="The difference shows up every month-end"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {REASONS.map((r, i) => (
            <Reveal key={r.title} delay={i * 80}>
              <div className="ml-lift h-full rounded-2xl border border-border bg-background p-7 shadow-sm">
                <h3 className="text-lg font-bold text-foreground">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {r.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-2xl font-bold text-foreground sm:text-3xl">
            See the difference on your own numbers
          </h2>
          <p className="max-w-xl text-muted-foreground">
            Bring your opening balances across with the guided wizard and run a
            month in MissionLedger — free, no credit card.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-12 gap-2 px-7"
              onClick={() => navigate("home", "signup")}
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 bg-card px-7"
              onClick={() => navigate("pricing")}
            >
              See pricing
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
