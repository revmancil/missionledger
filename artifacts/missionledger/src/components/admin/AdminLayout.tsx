import React, { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, BookOpen, Settings,
  Shield, LogOut, ArrowLeft, Terminal,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const navItems = [
  { href: "/admin", label: "Command Center", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/global-coa", label: "Global COA Template", icon: BookOpen },
];

export function AdminLayout({ children, title }: { children: ReactNode; title?: string }) {
  const [location] = useLocation();

  async function handleLogout() {
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = `${BASE}/admin/login`;
  }

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-slate-800 bg-slate-900">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
            <Terminal className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight">MissionLedger</div>
            <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest">Platform Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Navigation</p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/admin" ? location === "/admin" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-red-400" : "text-slate-500")} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-slate-800 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-slate-500" />
            Back to Main App
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-all"
          >
            <LogOut className="h-4 w-4 shrink-0 text-slate-500" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center px-8 border-b border-slate-800 bg-slate-900/50 sticky top-0 z-10 gap-3">
          <Shield className="h-4 w-4 text-red-500 shrink-0" />
          {title && <h1 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h1>}
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            SYSTEM ONLINE
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
