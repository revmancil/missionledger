/**
 * Site shell: sticky navigation, mobile drawer, and global footer.
 */
import * as React from "react";
import { Menu, X, ArrowRight, ArrowUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV, type RouteId } from "./data";
import { Brand, Container, SmoothLink } from "./ui";
import { navigate, hrefFor, useScrollReveal } from "./router";

/* ─────────────────────────────── Header ─────────────────────────────── */

function NavItem({
  id,
  label,
  active,
  onNavigate,
}: {
  id: RouteId;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={hrefFor(id)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(id);
        onNavigate?.();
      }}
      className={cn(
        "relative text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active ? (
        <span className="absolute -bottom-1.5 left-0 right-0 mx-auto h-1 w-1 rounded-full bg-primary" />
      ) : null}
    </a>
  );
}

export function Header({
  active,
  onShowChrome,
}: {
  active: RouteId;
  onShowChrome?: (v: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id: RouteId) => {
    navigate(id);
    setOpen(false);
    onShowChrome?.(false);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-background transition-[box-shadow,border-color] duration-300",
        scrolled ? "border-border/70 shadow-sm" : "border-transparent",
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <a
            href={hrefFor("home")}
            onClick={(e) => {
              e.preventDefault();
              go("home");
            }}
            className="shrink-0"
          >
            <Brand />
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <NavItem
                key={item.id}
                id={item.id}
                label={item.label}
                active={active === item.id}
              />
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={hrefFor("home")}
              onClick={(e) => {
                e.preventDefault();
                go("home");
              }}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </a>
            <Button
              onClick={() => go("home")}
              className="shadow-md shadow-primary/20"
            >
              Start free trial
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => {
              const next = !open;
              setOpen(next);
              onShowChrome?.(next);
            }}
            className="grid h-10 w-10 place-items-center rounded-lg border border-border text-foreground md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Mobile drawer */}
      <div
        className={cn(
          "overflow-hidden border-t border-border/60 bg-background md:hidden",
          open ? "max-h-[26rem] transition-[max-height] duration-300" : "max-h-0",
        )}
      >
        <Container>
          <nav className="flex flex-col py-3">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-3 text-left text-base font-medium transition-colors",
                  active === item.id
                    ? "text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {item.label}
                <ArrowRight className="h-4 w-4 opacity-40" />
              </button>
            ))}
            <div className="mt-3 flex flex-col gap-2 pb-2">
              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() => go("home")}
              >
                Log in
              </Button>
              <Button className="h-11 w-full" onClick={() => go("home")}>
                Start free trial
              </Button>
            </div>
          </nav>
        </Container>
      </div>
    </header>
  );
}

/* ─────────────────────────────── Footer ─────────────────────────────── */

const FOOTER_COLS: { title: string; links: { label: string; to: RouteId; anchor?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", to: "features" },
      { label: "Pricing", to: "pricing" },
      { label: "Compare to QuickBooks", to: "compare" },
      { label: "Security", to: "security" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "For nonprofits", to: "features", anchor: "org-types" },
      { label: "For churches", to: "features", anchor: "org-types" },
      { label: "For associations", to: "features", anchor: "org-types" },
      { label: "About us", to: "about" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Start free trial", to: "home", anchor: "signup" },
      { label: "Log in", to: "home" },
      { label: "Book a demo", to: "pricing" },
      { label: "FAQ", to: "pricing", anchor: "faq" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Purpose-built financial software for nonprofits, churches, and
              membership associations. Fund accounting, giving, and reporting in
              one place.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Fund accounting", "990 prep", "Audit logs"].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  <Check className="h-3 w-3 text-primary" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <SmoothLink
                      to={link.to}
                      anchor={link.anchor}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </SmoothLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MissionLedger. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span className="cursor-pointer transition-colors hover:text-foreground">
              Terms of Service
            </span>
            <span className="cursor-pointer transition-colors hover:text-foreground">
              Privacy Policy
            </span>
            <span className="cursor-pointer transition-colors hover:text-foreground">
              guide@genspark.ai
            </span>
          </div>
        </div>
      </Container>
    </footer>
  );
}

/* ───────────────────────────── Back to top ──────────────────────────── */

export function BackToTop() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

/* ─────────────────────────────── Layout ─────────────────────────────── */

export function SiteLayout({
  route,
  children,
}: {
  route: RouteId;
  children: React.ReactNode;
}) {
  const [chromeVisible, setChromeVisible] = React.useState(true);
  useScrollReveal([route, chromeVisible]);

  return (
    <div className="ml-marketing flex min-h-screen flex-col">
      <Header active={route} onShowChrome={setChromeVisible} />
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
    </div>
  );
}
