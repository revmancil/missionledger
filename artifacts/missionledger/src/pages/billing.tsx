import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CreditCard, Zap, Building2, Star, AlertCircle, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface Price {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: Price[];
}

interface SubscriptionInfo {
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  subscription: any;
  isComped?: boolean;
  compedNote?: string | null;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  Starter: <Zap className="w-5 h-5" />,
  Professional: <Star className="w-5 h-5" />,
  Enterprise: <Building2 className="w-5 h-5" />,
};

const STATUS_COLORS: Record<string, string> = {
  TRIAL: "bg-blue-100 text-blue-700 border-blue-200",
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  INACTIVE: "bg-gray-100 text-gray-600 border-gray-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
  COMPED: "bg-purple-100 text-purple-700 border-purple-200",
};

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

export default function BillingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/stripe/plans", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        setPlans(json.data || []);
        if ((json.data || []).length === 0) setStripeConfigured(false);
      })
      .catch(() => setStripeConfigured(false))
      .finally(() => setLoadingPlans(false));

    fetch("/api/stripe/subscription", { credentials: "include" })
      .then((r) => r.json())
      .then((info) => {
        setSubscriptionInfo(info);
        const params = new URLSearchParams(window.location.search);
        if (params.get("success") === "1") {
          window.history.replaceState({}, "", window.location.pathname);
          toast.success("Subscription activated! Welcome aboard.");
          fetch("/api/stripe/notify-subscribed", { method: "POST", credentials: "include" }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSubscription(false));
  }, []);

  const handleCheckout = async (priceId: string) => {
    setCheckingOut(priceId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start checkout");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start checkout");
    } finally {
      setCheckingOut(null);
    }
  };

  const handlePortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to open portal");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
    } finally {
      setOpeningPortal(false);
    }
  };

  const isComped = subscriptionInfo?.isComped ?? false;
  const compedNote = subscriptionInfo?.compedNote ?? null;
  const currentStatus = isComped ? "COMPED" : (subscriptionInfo?.subscriptionStatus || "TRIAL");
  const hasActiveSubscription = currentStatus === "ACTIVE";

  return (
    <AppLayout title="Billing & Subscription">
      {!stripeConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Stripe not connected</p>
            <p className="text-sm mt-1 text-amber-700">
              Subscription billing requires a Stripe account. Connect Stripe to activate subscription plans.
            </p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Current Subscription</CardTitle>
                <CardDescription className="mt-1">{user?.companyName}</CardDescription>
              </div>
              <Badge
                variant="outline"
                className={`text-sm px-3 py-1 font-semibold ${STATUS_COLORS[currentStatus] || STATUS_COLORS.INACTIVE}`}
              >
                {currentStatus}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSubscription ? (
              <p className="text-sm text-muted-foreground">Loading subscription details...</p>
            ) : isComped ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Complimentary access</p>
                  <p className="text-xs text-muted-foreground">
                    {compedNote || "This account has been granted complimentary access by MissionLedger."}
                  </p>
                </div>
              </div>
            ) : hasActiveSubscription ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Subscription active</p>
                    <p className="text-xs text-muted-foreground">
                      Manage your billing details, update payment method, or cancel in the billing portal.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={handlePortal} disabled={openingPortal}>
                  {openingPortal ? "Opening..." : "Manage Billing"}
                </Button>
              </div>
            ) : currentStatus === "TRIAL" ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">You're on the free trial</p>
                  <p className="text-xs text-muted-foreground">
                    Subscribe to a plan below to unlock full features and continue using MissionLedger.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>No active subscription. Choose a plan below to get started.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isComped ? null : <div>
        <h2 className="text-lg font-semibold mb-4">Subscription Plans</h2>
        {loadingPlans ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-5 bg-muted rounded w-24 mb-2" /><div className="h-4 bg-muted rounded w-32" /></CardHeader>
                <CardContent><div className="h-8 bg-muted rounded w-20 mb-4" /><div className="space-y-2">{[1,2,3].map(j => <div key={j} className="h-3 bg-muted rounded" />)}</div></CardContent>
              </Card>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No subscription plans available yet.</p>
              {!stripeConfigured && (
                <p className="text-sm text-muted-foreground mt-1">Connect Stripe to set up billing plans.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const monthlyPrice = plan.prices.find(
                (p) => p.recurring?.interval === "month"
              );
              const yearlyPrice = plan.prices.find(
                (p) => p.recurring?.interval === "year"
              );
              const displayPrice = monthlyPrice || plan.prices[0];
              const isPopular = plan.metadata?.featured === "true" || plan.name === "Professional";

              const features: string[] = plan.metadata?.features
                ? plan.metadata.features.split("|")
                : [];

              return (
                <Card
                  key={plan.id}
                  className={`relative shadow-sm transition-all hover:shadow-md ${
                    isPopular ? "border-primary ring-1 ring-primary/20" : ""
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {PLAN_ICONS[plan.name] || <CreditCard className="w-4 h-4" />}
                      </div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                    </div>
                    {plan.description && (
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {displayPrice && (
                      <div>
                        <span className="text-3xl font-bold">
                          {formatAmount(displayPrice.unit_amount, displayPrice.currency)}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          /{displayPrice.recurring?.interval || "one-time"}
                        </span>
                        {yearlyPrice && monthlyPrice && (
                          <p className="text-xs text-emerald-600 mt-1">
                            Save {Math.round((1 - yearlyPrice.unit_amount / (monthlyPrice.unit_amount * 12)) * 100)}% with annual billing
                          </p>
                        )}
                      </div>
                    )}

                    {features.length > 0 && (
                      <ul className="space-y-2">
                        {features.map((feat, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feat.trim()}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="space-y-2 pt-2">
                      {monthlyPrice && (
                        <Button
                          className="w-full"
                          variant={isPopular ? "default" : "outline"}
                          disabled={!!checkingOut || hasActiveSubscription}
                          onClick={() => handleCheckout(monthlyPrice.id)}
                        >
                          {checkingOut === monthlyPrice.id ? "Redirecting..." : hasActiveSubscription ? "Current Plan" : "Subscribe Monthly"}
                        </Button>
                      )}
                      {yearlyPrice && !hasActiveSubscription && (
                        <Button
                          className="w-full"
                          variant="ghost"
                          size="sm"
                          disabled={!!checkingOut}
                          onClick={() => handleCheckout(yearlyPrice.id)}
                        >
                          {checkingOut === yearlyPrice.id ? "Redirecting..." : `Subscribe Annually (${formatAmount(yearlyPrice.unit_amount, yearlyPrice.currency)}/yr)`}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>}
    </AppLayout>
  );
}
