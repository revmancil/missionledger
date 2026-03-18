import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as SonnerToaster } from "sonner";
import { useAuth } from "@/hooks/use-auth";

// Pages
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import DashboardPage from "@/pages/dashboard";
import DonationsPage from "@/pages/donations";
import FundsPage from "@/pages/funds";
import AccountsPage from "@/pages/accounts";
import ExpensesPage from "@/pages/expenses";
import VendorsPage from "@/pages/vendors";
import BillsPage from "@/pages/bills";
import PledgesPage from "@/pages/pledges";
import BankAccountsPage from "@/pages/bank-accounts";
import BankRegisterPage from "@/pages/bank-register";
import ReconciliationPage from "@/pages/reconciliation";
import ReportsPage from "@/pages/reports";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading session...</div></div>;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
      <Route path="/donations"><ProtectedRoute component={DonationsPage} /></Route>
      <Route path="/expenses"><ProtectedRoute component={ExpensesPage} /></Route>
      <Route path="/funds"><ProtectedRoute component={FundsPage} /></Route>
      <Route path="/accounts"><ProtectedRoute component={AccountsPage} /></Route>
      <Route path="/vendors"><ProtectedRoute component={VendorsPage} /></Route>
      <Route path="/bills"><ProtectedRoute component={BillsPage} /></Route>
      <Route path="/pledges"><ProtectedRoute component={PledgesPage} /></Route>
      <Route path="/bank-accounts"><ProtectedRoute component={BankAccountsPage} /></Route>
      <Route path="/bank-register"><ProtectedRoute component={BankRegisterPage} /></Route>
      <Route path="/reconciliation"><ProtectedRoute component={ReconciliationPage} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
