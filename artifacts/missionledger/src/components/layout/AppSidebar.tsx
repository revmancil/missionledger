import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, Heart, Receipt, Wallet, BookOpen, Building2, 
  FileText, HandHeart, LogOut, Settings, BarChart3, Building,
  Banknote, ClipboardList, RefreshCcw, Wand2, Scale
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ]
  },
  {
    label: "Transactions",
    items: [
      { href: "/donations", label: "Donations", icon: Heart },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/bills", label: "Bills", icon: FileText },
      { href: "/pledges", label: "Pledges", icon: HandHeart },
    ]
  },
  {
    label: "Accounting & Banking",
    items: [
      { href: "/bank-register", label: "Bank Register", icon: ClipboardList },
      { href: "/reconciliation", label: "Reconciliation", icon: RefreshCcw },
      { href: "/bank-accounts", label: "Bank Accounts", icon: Banknote },
      { href: "/accounts", label: "Chart of Accounts", icon: BookOpen },
      { href: "/opening-balance", label: "Opening Balances", icon: Wand2 },
      { href: "/trial-balance",   label: "Trial Balance",    icon: Scale  },
      { href: "/funds", label: "Funds", icon: Wallet },
    ]
  },
  {
    label: "Contacts",
    items: [
      { href: "/vendors", label: "Vendors", icon: Building2 },
    ]
  }
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex h-screen sticky top-0 shrink-0">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
          <Building className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-display font-bold text-lg leading-none text-foreground">MissionLedger</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group.label}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border">
            <span className="text-sm font-bold text-secondary-foreground">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.companyName || "Organization"}</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start text-muted-foreground" 
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
