/**
 * Pricing — plans, comparison, add-ons, and FAQ.
 */
import * as React from "react";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navigate } from "../nav";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  Pill,
  CtaButtons,
} from "../ui";
import { PLANS, FAQS } from "../data";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const MATRIX: { label: string; values: (string | boolean)[] }[] = [
  { label: "Bank accounts", values: ["1", "5", "Unlimited"] },
  { label: "Transactions / month", values: ["500", "Unlimited", "Unlimited"] },
  { label: "Team users", values: ["2", "10", "Unlimited"] },
  { label: "Fund accounting", values: [true, true, true] },
  { label: "Donor & giver records", values: [true, true, true] },
  { label: "Giving statements", values: [true, true, true] },
  { label: "Bank reconciliation", values: [false, true, true] },
  { label: "Period close tool", values: [false, true, true] },
  { label: "990 reporting tool", values: [false, true, true] },
  { label: "Pledges & campaigns", values: [false, true, true] },
  { label: "Custom & scheduled reports", values: [false, false, true] },
  { label: "Multi-org management", values: [false, false, true] },
  { label: "API access", values: [false, false, true] },
  { label: "Support", values: ["Email", "Priority", "Dedicated"] },
];

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto h-5 w-5 text-accent" />
    ) : (
      <Minus className="mx-auto h-5 w-5 text-muted-foreground/40" />
    );
  }
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

export default function Pricing() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-10">
        <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Pill className="border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Free trial on every plan
              </Pill>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                Simple, transparent pricing
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                Flat monthly pricing with no per-transaction fees and no
                surprise charges. Start with the essentials and upgrade only
                when your organization grows into it.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Plan cards */}
      <Section className="pt-6">
        <div className="grid items-start gap-6 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 80}>
              <div
                className={cn(
                  "ml-lift relative flex h-full flex-col rounded-2xl border bg-card p-8 shadow-sm",
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
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                <p className="mt-5 text-5xl font-extrabold tracking-tight text-foreground">
                  {plan.price}
                  <span className="text-base font-normal text-muted-foreground">
                    {plan.period}
                  </span>
                </p>
                <Button
                  variant={plan.popular ? "default" : "outline"}
                  className="mt-6 h-11 w-full"
                  onClick={() => navigate("home", "signup")}
                >
                  {plan.cta}
                </Button>
                <ul className="mt-7 flex-1 space-y-3 border-t border-border pt-6">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          All plans include a free trial. No credit card required to start.
        </p>
      </Section>

      {/* Comparison matrix */}
      <Section className="bg-card">
        <SectionHeading
          eyebrow="Plan comparison"
          title="Compare every plan in detail"
        />
        <Reveal>
          <div className="overflow-x-auto rounded-2xl border border-border bg-background">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="p-4 text-sm font-semibold text-foreground">
                    Capability
                  </th>
                  {PLANS.map((p) => (
                    <th
                      key={p.name}
                      className={cn(
                        "p-4 text-center text-sm font-semibold",
                        p.popular ? "text-primary" : "text-foreground",
                      )}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row, ri) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      ri % 2 === 1 && "bg-muted/20",
                    )}
                  >
                    <td className="p-4 text-sm font-medium text-foreground">
                      {row.label}
                    </td>
                    {row.values.map((v, vi) => (
                      <td key={vi} className="p-4 text-center">
                        <Cell value={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </Section>

      {/* Add-ons / value reassurance */}
      <Section>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "No per-transaction fees",
              body: "Process giving and record entries without watching a meter. Your bill stays flat as you grow.",
            },
            {
              title: "Migrate with confidence",
              body: "The Opening Balances Wizard includes a CSV template and live validation so onboarding doesn't become a project.",
            },
            {
              title: "Switch plans anytime",
              body: "Upgrade or downgrade from the billing page. Your data and history stay exactly where they are.",
            },
          ].map((c, i) => (
            <Reveal key={c.title} delay={i * 70}>
              <div className="ml-lift h-full rounded-2xl border border-border bg-card p-7 shadow-sm">
                <h3 className="text-lg font-bold text-foreground">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" className="bg-card">
        <SectionHeading
          eyebrow="Pricing questions"
          title="Answers before you commit"
        />
        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.slice(0, 5).map((item, i) => (
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

      {/* CTA */}
      <Section>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-primary px-8 py-14 text-center">
          <div className="absolute inset-0 ml-glow opacity-70" />
          <div className="relative mx-auto max-w-2xl text-primary-foreground">
            <h2 className="text-3xl font-extrabold tracking-tight">
              Start your free trial today
            </h2>
            <p className="mx-auto mt-4 text-lg opacity-90">
              Set up your organization and see fund accounting, giving, and
              reporting working together — in minutes, not weeks.
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                size="lg"
                className="h-12 gap-2 bg-primary-foreground px-8 text-base text-primary hover:bg-primary-foreground/90"
                onClick={() => navigate("home", "signup")}
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
