/**
 * Security — trust, data protection, and controls.
 */
import * as React from "react";
import {
  ShieldCheck,
  Lock,
  ScrollText,
  Server,
  UserCheck,
  RefreshCcw,
  ArrowRight,
} from "lucide-react";
import { navigate } from "../router";
import {
  Container,
  Section,
  SectionHeading,
  Reveal,
  Pill,
  IconTile,
} from "../ui";
import { Button } from "@/components/ui/button";

const PILLARS = [
  {
    icon: ScrollText,
    title: "Immutable audit trail",
    body: "Every transaction, journal entry, close, and reopen is logged with who did it, when, and what changed — with before/after values you can inspect.",
  },
  {
    icon: UserCheck,
    title: "Role-based access",
    body: "Granular roles (admin, staff, viewer, and org-specific roles) keep sensitive financial controls in the right hands and out of everyone else's.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit & at rest",
    body: "Sessions travel over TLS with httpOnly cookies, and your financial data is encrypted at rest in managed PostgreSQL.",
  },
  {
    icon: Server,
    title: "Tenant isolation",
    body: "Every record is scoped to your organization. Queries are filtered to your company ID at the application layer on every request.",
  },
  {
    icon: ShieldCheck,
    title: "Period locks & close controls",
    body: "Soft-lock periods and hard-close the year so posted activity can't be quietly edited. Reopening requires a role and a recorded reason.",
  },
  {
    icon: RefreshCcw,
    title: "Balanced, enforced ledgers",
    body: "Double-entry is enforced by the GL engine — partial, unbalanced entries are never persisted, so the books always reconcile.",
  },
];

const PRACTICES = [
  "Signed, HttpOnly session cookies with expiry",
  "Password hashing with bcrypt",
  "Rate limiting on authentication and webhooks",
  "Fail-closed validation on inbound payment webhooks",
  "Global error handling that never leaks internals",
  "Separate platform-admin layer for support access",
];

export default function Security() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10 ml-glow" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Pill className="border-primary/20 bg-primary/10 text-primary">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Security & trust
              </Pill>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                Your books deserve bank-grade care
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                Money held in trust demands more than a login screen.
                MissionLedger pairs financial controls with platform security so
                your organization stays accountable and your data stays
                protected.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      <Section className="pt-4">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 70}>
              <div className="ml-lift h-full rounded-2xl border border-border bg-card p-7 shadow-sm">
                <IconTile icon={p.icon} />
                <h3 className="mt-5 text-base font-bold text-foreground">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="bg-card">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Built-in practices"
              title="Security isn't a feature you enable later"
              align="left"
              className="mb-8"
            />
            <ul className="space-y-3">
              {PRACTICES.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-accent/15">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                  </span>
                  <span className="text-sm text-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <Reveal>
            <div className="rounded-2xl border border-border bg-background p-7 shadow-lg shadow-primary/5">
              <h3 className="text-lg font-bold text-foreground">
                Audit-first by design
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                When your board or auditor asks “who changed this number, and
                why?”, the answer is already recorded.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { action: "JOURNAL_ENTRY", detail: "Created · posted to Fund 100" },
                  { action: "PERIOD_ROLL_FORWARD", detail: "FY2025 closed" },
                  { action: "PERIOD_REOPEN", detail: "Reason recorded · MASTER_ADMIN" },
                ].map((row) => (
                  <div
                    key={row.action}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3"
                  >
                    <span className="font-mono text-xs font-medium text-primary">
                      {row.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section>
        <div className="flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-2xl font-bold text-foreground sm:text-3xl">
            Questions about security or compliance?
          </h2>
          <Button
            size="lg"
            className="h-12 gap-2 px-7"
            onClick={() => navigate("home", "signup")}
          >
            Talk to us
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Section>
    </>
  );
}
