import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppSidebar } from "./AppSidebar";
import { Menu, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { useAuth } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function TrialBanner() {
  const { isAuthenticated, isPlatformAdmin } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  const { data: sub } = useQuery<any>({
    queryKey: ["subscription-status"],
    queryFn: () =>
      fetch(`${BASE}/api/stripe/subscription`, { credentials: "include" }).then((r) => r.json()),
    enabled: isAuthenticated && !isPlatformAdmin,
    staleTime: 60_000,
  });

  if (!sub || sub.subscriptionStatus !== "TRIAL" || dismissed || sub.isTrialExpired) return null;

  const days = sub.daysRemaining ?? 0;
  const urgent = days <= 3;
  const warning = days <= 7;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium border-b ${
        urgent
          ? "bg-red-50 border-red-200 text-red-800"
          : warning
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-blue-50 border-blue-200 text-blue-800"
      }`}
    >
      <span className="flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0" />
        {days === 0
          ? "Your free trial expires today."
          : days === 1
          ? "1 day remaining in your free trial."
          : `${days} days remaining in your free trial.`}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setLocation("/billing")}
          className={`underline underline-offset-2 hover:no-underline font-semibold ${
            urgent ? "text-red-700" : warning ? "text-amber-700" : "text-blue-700"
          }`}
        >
          Subscribe now
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 rounded hover:bg-black/10"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

export function AppLayout({ children, title }: { children: ReactNode, title?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isImpersonating, exitImpersonation } = useAuth();

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 flex flex-col min-w-0">
        <TrialBanner />
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 md:px-8 sticky top-0 z-10 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          {title && <h1 className="text-lg sm:text-xl font-display font-semibold text-foreground truncate">{title}</h1>}
          {isImpersonating && (
            <Button
              variant="outline"
              className="ml-auto text-xs sm:text-sm border-amber-300 text-amber-800 hover:bg-amber-50"
              onClick={() => exitImpersonation()}
            >
              Return to Platform Admin
            </Button>
          )}
        </header>
        <div className="p-4 md:p-8 flex-1 overflow-auto animate-fade-in">
          <div className="max-w-6xl mx-auto space-y-6">
            {children}
          </div>
        </div>
      </main>
      <HelpSidebar />
    </div>
  );
}
