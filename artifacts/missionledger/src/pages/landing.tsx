import { Link } from "wouter";
import { Building2, PieChart, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-50 border-b border-border/50">
        <div className="flex items-center">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="MissionLedger" className="h-10 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-4">
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
      </main>

      <footer className="bg-foreground text-background py-12 text-center">
        <div className="flex items-center justify-center gap-4 text-sm opacity-70 mb-2">
          <a href="/missionledger/terms" className="hover:opacity-100 hover:underline">Terms of Service</a>
          <span className="opacity-40">·</span>
          <a href="/missionledger/privacy" className="hover:opacity-100 hover:underline">Privacy Policy</a>
        </div>
        <p className="text-muted opacity-50 text-sm">© {new Date().getFullYear()} MissionLedger. All rights reserved.</p>
      </footer>
    </div>
  );
}
