import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as SonnerToaster } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { FinancialSyncProvider } from "@/lib/financial-sync";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Pages
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import DashboardPage from "@/pages/dashboard";
import FundsPage from "@/pages/funds";
import AccountsPage from "@/pages/accounts";
import AccountLedgerPage from "@/pages/account-ledger";
import VendorsPage from "@/pages/vendors";
import PledgesPage from "@/pages/pledges";
import BankAccountsPage from "@/pages/bank-accounts";
import BankRegisterPage from "@/pages/bank-register";
import ReconciliationPage from "@/pages/reconciliation";
import OpeningBalancePage from "@/pages/opening-balance";
import JournalEntriesPage from "@/pages/journal-entries";
import TrialBalancePage from "@/pages/trial-balance";
import PeriodClosePage from "@/pages/period-close";
import ReportsPage from "@/pages/reports";
import CustomReportsPage from "@/pages/custom-reports";
import DonorGivingPage from "@/pages/donor-giving";
import BillingPage from "@/pages/billing";
import ForgotPasswordPage from "@/pages/auth/forgot-password";
import ResetPasswordPage from "@/pages/auth/reset-password";
import TermsPage from "@/pages/terms";
import PrivacyPage from "@/pages/privacy";
import NotFound from "@/pages/not-found";
import AdminCommandCenter from "@/pages/admin/index";
import AdminLoginPage from "@/pages/admin/login";
import AdminGlobalCoaPage from "@/pages/admin/global-coa";
import AdminAuditLogsPage from "@/pages/admin/audit-logs";
import BudgetPage from "@/pages/budget";
import AdminUsersPage from "@/pages/admin-users";
import GivePage from "@/pages/give";
import PricingPage from "@/pages/pricing";
import FeaturesPage from "@/pages/features";
import CompareQuickbooksPage from "@/pages/compare-quickbooks";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useSubscription(enabled: boolean) {
  return useQuery<any>({
    queryKey: ["subscription-status"],
    queryFn: () =>
      fetch(`${BASE}/api/stripe/subscription`, { credentials: "include" }).then((r) => r.json()),
    enabled,
    staleTime: 60_000,
  });
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading session...</div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function SubscriptionGatedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, isPlatformAdmin } = useAuth();
  const { data: sub, isLoading: subLoading } = useSubscription(isAuthenticated && !isPlatformAdmin);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Redirect to="/login" />;

  if (!isPlatformAdmin) {
    if (subLoading) return <LoadingScreen />;
    if (sub) {
      const locked =
        sub.subscriptionStatus === "INACTIVE" ||
        sub.subscriptionStatus === "CANCELLED" ||
        sub.isTrialExpired;
      if (locked) return <Redirect to="/billing" />;
    }
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/give" component={GivePage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/compare/quickbooks" component={CompareQuickbooksPage} />

      <Route path="/dashboard"><SubscriptionGatedRoute component={DashboardPage} /></Route>
      <Route path="/funds"><SubscriptionGatedRoute component={FundsPage} /></Route>
      <Route path="/accounts/:id/ledger"><SubscriptionGatedRoute component={AccountLedgerPage} /></Route>
      <Route path="/accounts"><SubscriptionGatedRoute component={AccountsPage} /></Route>
      <Route path="/vendors"><SubscriptionGatedRoute component={VendorsPage} /></Route>
      <Route path="/pledges"><SubscriptionGatedRoute component={PledgesPage} /></Route>
      <Route path="/bank-accounts"><SubscriptionGatedRoute component={BankAccountsPage} /></Route>
      <Route path="/bank-register"><SubscriptionGatedRoute component={BankRegisterPage} /></Route>
      <Route path="/reconciliation"><SubscriptionGatedRoute component={ReconciliationPage} /></Route>
      <Route path="/opening-balance"><SubscriptionGatedRoute component={OpeningBalancePage} /></Route>
      <Route path="/journal-entries"><SubscriptionGatedRoute component={JournalEntriesPage} /></Route>
      <Route path="/trial-balance"><SubscriptionGatedRoute component={TrialBalancePage} /></Route>
      <Route path="/period-close"><SubscriptionGatedRoute component={PeriodClosePage} /></Route>
      <Route path="/reports"><SubscriptionGatedRoute component={ReportsPage} /></Route>
      <Route path="/custom-reports"><SubscriptionGatedRoute component={CustomReportsPage} /></Route>
      <Route path="/budget"><SubscriptionGatedRoute component={BudgetPage} /></Route>
      <Route path="/donor-giving"><SubscriptionGatedRoute component={DonorGivingPage} /></Route>
      <Route path="/master-admin"><Redirect to="/admin" /></Route>
      <Route path="/billing"><ProtectedRoute component={BillingPage} /></Route>
      <Route path="/admin-users"><SubscriptionGatedRoute component={AdminUsersPage} /></Route>

      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/audit-logs" component={AdminAuditLogsPage} />
      <Route path="/admin/global-coa" component={AdminGlobalCoaPage} />
      <Route path="/admin" component={AdminCommandCenter} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <FinancialSyncProvider>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </FinancialSyncProvider>
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-right" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
