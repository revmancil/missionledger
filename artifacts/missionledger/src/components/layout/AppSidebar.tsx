import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Wallet, BookOpen, Building2,
  HandHeart, LogOut, BarChart3, Building,
  Banknote, ClipboardList, RefreshCcw, Wand2, Scale, CalendarCheck,
  ChevronDown, ArrowLeftRight, Shield, AlertTriangle, CheckCircle2,
  CreditCard, PenLine, X, Heart, Target, SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

const navGroups = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/custom-reports", label: "Custom Reports", icon: SlidersHorizontal },
      { href: "/budget", label: "Budget Manager", icon: Target },
    ]
  },
  {
    label: "Transactions",
    items: [
      { href: "/pledges", label: "Pledges", icon: HandHeart },
      { href: "/donor-giving", label: "Donor Giving", icon: Heart },
    ]
  },
  {
    label: "Accounting & Banking",
    items: [
      { href: "/bank-register", label: "Bank Register", icon: ClipboardList },
      { href: "/reconciliation", label: "Reconciliation", icon: RefreshCcw },
      { href: "/bank-accounts", label: "Bank Accounts", icon: Banknote },
      { href: "/accounts", label: "Chart of Accounts", icon: BookOpen },
      { href: "/journal-entries", label: "Journal Entries", icon: PenLine },
      { href: "/opening-balance", label: "Opening Balances", icon: Wand2 },
      { href: "/trial-balance", label: "Trial Balance", icon: Scale },
      { href: "/period-close", label: "Period Close", icon: CalendarCheck },
      { href: "/funds", label: "Funds", icon: Wallet },
    ]
  },
  {
    label: "Contacts",
    items: [
      { href: "/vendors", label: "Vendors", icon: Building2 },
    ]
  },
  {
    label: "Account",
    items: [
      { href: "/billing", label: "Billing", icon: CreditCard },
    ]
  }
];

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout, myOrgs, switchOrg, isPlatformAdmin, isImpersonating, exitImpersonation } = useAuth();
  const [switching, setSwitching] = useState(false);
  const canManageUsers = isPlatformAdmin || user?.role === "MASTER_ADMIN" || user?.role === "ADMIN";
  const isBoardRole = user?.role === "OFFICER";
  const boardAllowed = new Set([
    "/dashboard",
    "/reports",
    "/custom-reports",
    "/budget",
    "/pledges",
    "/donor-giving",
    "/vendors",
  ]);

  const handleSwitchOrg = async (companyId: string) => {
    if (companyId === user?.companyId) return;
    setSwitching(true);
    try {
      await switchOrg(companyId);
    } catch (e: any) {
      toast.error(e.message || "Failed to switch organization");
    } finally {
      setSwitching(false);
    }
  };

  const handleExitImpersonation = async () => {
    try {
      await exitImpersonation();
      toast.success("Returned to Platform Admin view");
    } catch (e: any) {
      toast.error(e.message || "Failed to exit impersonation");
    }
  };

  const handleNavClick = () => {
    onClose();
  };

  const sidebarContent = (
    <>
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-3 py-2 text-xs font-medium flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="flex-1 truncate">Viewing as {user?.companyName}</span>
          <button
            onClick={handleExitImpersonation}
            className="underline hover:no-underline whitespace-nowrap"
          >
            Return to Platform Admin
          </button>
        </div>
      )}

      {/* Logo + mobile close button */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="MissionLedger"
            className="h-10 w-auto object-contain"
          />
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Org Switcher — only shown if user has multiple orgs */}
      {myOrgs.length > 1 && (
        <div className="px-3 pt-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={switching}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted text-sm transition-colors"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <Building className="w-3 h-3 text-primary" />
                </div>
                <span className="flex-1 text-left font-medium text-foreground truncate text-xs">
                  {user?.companyName}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Your Organizations
              </div>
              <DropdownMenuSeparator />
              {myOrgs.map((org: any) => (
                <DropdownMenuItem
                  key={org.companyId}
                  onClick={() => handleSwitchOrg(org.companyId)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{org.companyName}</p>
                    <p className="text-xs text-muted-foreground">{org.companyCode} · {org.role}</p>
                  </div>
                  {org.companyId === user?.companyId && (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  )}
                  {!org.isActive && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                      Suspended
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/register" className="flex items-center gap-2 text-sm cursor-pointer">
                  <ArrowLeftRight className="w-4 h-4" />
                  Register New Organization
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {canManageUsers && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Administration
            </h3>
            <div className="space-y-1">
              <Link
                href="/admin-users"
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location === "/admin-users"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Shield className={cn("w-5 h-5 shrink-0", location === "/admin-users" ? "text-primary" : "text-muted-foreground")} />
                Admin Users
              </Link>
            </div>
          </div>
        )}
        {navGroups.map((group) => (
          <div key={group.label}>
            <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {group.label}
            </h3>
            <div className="space-y-1">
              {group.items
                .filter((item) => !isBoardRole || boardAllowed.has(item.href))
                .map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-border shrink-0">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border shrink-0">
            <span className="text-sm font-bold text-secondary-foreground">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {myOrgs.length <= 1 ? (user?.companyName || "Organization") : `${myOrgs.length} organizations`}
            </p>
          </div>
          {isPlatformAdmin && (
            <Link href="/admin" onClick={handleNavClick} title="Platform Admin Command Center">
              <Shield className="w-4 h-4 text-primary shrink-0 hover:text-primary/70 transition-colors" />
            </Link>
          )}
        </div>
        <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground/60 mb-2">
          <a href="/missionledger/terms" className="hover:text-muted-foreground hover:underline">Terms</a>
          <span>·</span>
          <a href="/missionledger/privacy" className="hover:text-muted-foreground hover:underline">Privacy</a>
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
    </>
  );

  return (
    <>
      {/* Mobile: backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Desktop: sticky sidebar (always visible) */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col h-screen sticky top-0 shrink-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile: slide-over drawer */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
