/**
 * Shared visual primitives for the marketing pages (production).
 * Ported from the sandbox prototype; links now use wouter so URLs are real.
 */
import * as React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { pathFor, scrollToId } from "./nav";
import type { RouteId } from "./data";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

/** Internal link between marketing pages, with optional same-page anchor. */
export function SmoothLink({
  to,
  anchor,
  className,
  children,
  onNavigate,
}: {
  to: RouteId;
  anchor?: string;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const [current, setLocation] = useLocation();
  const path = pathFor(to);
  const href = path + (anchor ? `#${anchor}` : "");

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.();
        if (current === path) {
          if (anchor) scrollToId(anchor);
          return;
        }
        setLocation(path);
        if (anchor) window.setTimeout(() => scrollToId(anchor), 80);
      }}
    >
      {children}
    </a>
  );
}

/** Anchor that scrolls to a section on the current page. */
export function ScrollLink({
  anchor,
  className,
  children,
  onNavigate,
}: {
  anchor: string;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={`#${anchor}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.();
        scrollToId(anchor);
      }}
    >
      {children}
    </a>
  );
}

/** Brand logo with graceful fallback to a built wordmark. */
export function Brand({
  className,
  onClick,
  variant = "logo",
}: {
  className?: string;
  onClick?: () => void;
  variant?: "logo" | "mark";
}) {
  const [broken, setBroken] = React.useState(false);
  const src = `${import.meta.env.BASE_URL}images/${
    variant === "mark" ? "logo-icon.png" : "logo.png"
  }`;

  if (!broken) {
    return (
      <img
        src={src}
        alt="MissionLedger"
        onError={() => setBroken(true)}
        onClick={onClick}
        className={cn("h-12 w-auto object-contain", onClick && "cursor-pointer", className)}
      />
    );
  }

  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M4 18V9l8-5 8 5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 18v-5h6v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      Mission<span className="text-primary">Ledger</span>
    </span>
  );
}

export function Section({
  id,
  className,
  children,
  container = true,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  container?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-20 sm:py-24", className)}>
      {container ? <Container>{children}</Container> : children}
    </section>
  );
}

export function Eyebrow({
  icon: Icon,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary",
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  title,
  subtitle,
  align = "center",
  className,
}: {
  eyebrow?: string;
  eyebrowIcon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-14",
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow ? (
        <div className={cn(align === "center" && "flex justify-center")}>
          <Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow>
        </div>
      ) : null}
      <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={cn("ml-reveal", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function IconTile({
  icon: Icon,
  className,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: "h-10 w-10 rounded-lg",
    md: "h-12 w-12 rounded-xl",
    lg: "h-14 w-14 rounded-2xl",
  }[size];
  const iconDims = { sm: "h-5 w-5", md: "h-6 w-6", lg: "h-7 w-7" }[size];
  return (
    <div
      className={cn(
        "grid place-items-center bg-primary/10 text-primary ring-1 ring-inset ring-primary/10 transition-transform duration-300 group-hover:scale-105",
        dims,
        className,
      )}
    >
      <Icon className={iconDims} />
    </div>
  );
}

/** Primary/secondary CTA pair used across hero + closing sections. */
export function CtaButtons({
  className,
  secondaryLabel = "Book a demo",
}: {
  className?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <Link href="/register">
        <Button size="lg" className="h-12 gap-2 px-7 text-base shadow-lg shadow-primary/25">
          Start free trial
        </Button>
      </Link>
      <Link href="/pricing">
        <Button
          size="lg"
          variant="outline"
          className="h-12 bg-card/60 px-7 text-base backdrop-blur"
        >
          {secondaryLabel}
        </Button>
      </Link>
    </div>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
