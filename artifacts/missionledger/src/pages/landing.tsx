import { Link } from "wouter";
import { Building2, PieChart, ShieldCheck, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Price {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: Price[];
}

function formatPrice(price: Price): string {
  if (price.unit_amount == null) return "Contact us";
  const dollars = price.unit_amount / 100;
  const period = price.recurring?.interval === "year" ? "/year" : "/month";
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}${period}`;
}

function getPrimaryPrice(prices: Price[]): Price | null {
  if (!prices.length) return null;
  const monthly = prices.find((p) => p.recurring?.interval === "month");
  return monthly ?? prices[0];
}

function getFeatures(plan: Plan): string[] {
  const featuresStr = plan.metadata?.features;
  if (featuresStr) {
    try {
      const parsed = JSON.parse(featuresStr);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    const separator = featuresStr.includes("|") ? "|" : ",";
    return featuresStr.split(separator).map((f) => f.trim()).filter(Boolean);
  }
  if (plan.description) return [plan.description];
  return [];
}

function getRecommendedId(plans: Plan[]): string | null {
  const byMetadata = plans.find(
    (p) => p.metadata?.recommended === "true" || p.metadata?.popular === "true"
  );
  if (byMetadata) return byMetadata.id;
  const byName = plans.find((p) => {
    const n = p.name.toLowerCase();
    return n.includes("pro") || n.includes("standard");
  });
  return byName?.id ?? null;
}

function PlanCards({ plans }: { plans: Plan[] }) {
  const recommendedId = getRecommendedId(plans);
  return (
    <div className={`grid gap-8 ${plans.length === 1 ? "max-w-sm mx-auto" : plans.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3"}`}>
      {plans.map((plan) => {
        const price = getPrimaryPrice(plan.prices);
        const features = getFeatures(plan);
        const recommended = plan.id === recommendedId;
        return (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border p-8 shadow-sm transition-all hover:shadow-md ${
              recommended
                ? "border-primary bg-primary/5 ring-2 ring-primary shadow-primary/10"
                : "border-border bg-card"
            }`}
          >
            {recommended && (
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full shadow">
                Most Popular
              </span>
            )}
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              {price ? (
                <p className="text-4xl font-extrabold text-foreground">
                  {formatPrice(price)}
                </p>
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">Contact us</p>
              )}
            </div>

            {features.length > 0 && (
              <ul className="flex-1 space-y-3 mb-8">
                {features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className={features.length === 0 ? "mt-6" : ""}>
              <Link href="/register">
                <Button className="w-full" variant={recommended ? "default" : "outline"}>
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PricingSection() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/stripe/plans`)
      .then((r) => {
        if (!r.ok) throw new Error("Non-ok response");
        return r.json();
      })
      .then((json) => {
        const data: Plan[] = json.data ?? [];
        const lowestMonthly = (plan: Plan): number => {
          const monthly = plan.prices.filter((p) => p.recurring?.interval === "month");
          if (monthly.length > 0) return Math.min(...monthly.map((p) => p.unit_amount ?? Infinity));
          return plan.prices[0]?.unit_amount ?? Infinity;
        };
        data.sort((a, b) => lowestMonthly(a) - lowestMonthly(b));
        setPlans(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-display font-bold">Simple, transparent pricing</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Start with a free trial. No credit card required.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              Contact us for pricing at{" "}
              <a href="mailto:hello@missionledger.com" className="text-primary underline underline-offset-2">
                hello@missionledger.com
              </a>
            </p>
          </div>
        )}

        {!loading && !error && plans.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              Contact us for pricing at{" "}
              <a href="mailto:hello@missionledger.com" className="text-primary underline underline-offset-2">
                hello@missionledger.com
              </a>
            </p>
          </div>
        )}

        {!loading && !error && plans.length > 0 && (
          <PlanCards plans={plans} />
        )}
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-50 border-b border-border/50">
        <div className="flex items-center">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="MissionLedger" className="h-10 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-6">
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
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Log in
          </Link>
          <Link href="/register">
            <Button className="shadow-lg shadow-primary/20">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative pt-24 pb-32 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
              alt="Background" 
              className="w-full h-full object-cover opacity-20"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
          </div>
          
          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center animate-slide-up">
            <h1 className="text-5xl md:text-7xl font-display font-extrabold text-foreground tracking-tight max-w-4xl mx-auto leading-tight">
              Financial clarity for <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">mission-driven</span> organizations.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Fund accounting, donor management, and financial reporting built specifically for nonprofits, churches, and associations.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="h-14 px-8 text-base shadow-xl shadow-primary/25 group">
                  Start your free trial
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-14 px-8 text-base bg-card/50 backdrop-blur">
                  View Demo
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-24 bg-card border-y border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-display font-bold">Everything you need to manage your mission</h2>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: PieChart,
                  title: "True Fund Accounting",
                  desc: "Track restricted and unrestricted funds with ease. Generate balance sheets by fund instantly."
                },
                {
                  icon: Building2,
                  title: "Donor Management",
                  desc: "Keep track of pledges, recurring donations, and generate year-end tax statements automatically."
                },
                {
                  icon: ShieldCheck,
                  title: "Audit-Ready & Secure",
                  desc: "Bank reconciliation, immutable audit logs, and role-based access keep your financials secure."
                }
              ].map((feature, i) => (
                <div key={i} className="bg-background p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PricingSection />
      </main>

      <footer className="bg-foreground text-background py-12 text-center">
        <div className="flex items-center justify-center gap-4 text-sm opacity-70 mb-2">
          <a href={`${BASE}/terms`} className="hover:opacity-100 hover:underline">Terms of Service</a>
          <span className="opacity-40">·</span>
          <a href={`${BASE}/privacy`} className="hover:opacity-100 hover:underline">Privacy Policy</a>
        </div>
        <p className="text-muted opacity-50 text-sm">© {new Date().getFullYear()} MissionLedger. All rights reserved.</p>
      </footer>
    </div>
  );
}
