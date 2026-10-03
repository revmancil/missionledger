/**
 * Production navigation helpers for the marketing pages.
 *
 * The prototype used a self-contained hash router (it ran inside the
 * mockup-sandbox). In the real app, routing is wouter, so this module
 * maps the prototype's route ids onto real, public URLs and re-exports
 * the small scroll helpers the pages rely on.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { navigate as wouterNavigate } from "wouter/use-browser-location";
import type { RouteId } from "./data";

/**
 * Base path the app is mounted under (mirrors the <WouterRouter base> value).
 * Empty string when served from the root.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Real (public) URLs for each marketing route. */
export const ROUTE_PATHS: Record<RouteId, string> = {
  home: "/",
  features: "/features",
  pricing: "/pricing",
  about: "/about",
  security: "/security",
  compare: "/compare/quickbooks",
};

export function pathFor(route: RouteId): string {
  return ROUTE_PATHS[route] ?? "/";
}

/** Smoothly scroll to an element by id, accounting for the sticky header. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 84;
  window.scrollTo({ top, behavior: "smooth" });
}

/** Programmatic navigation that matches the prototype's `navigate()` API. */
export function navigate(route: RouteId, anchor?: string) {
  const path = pathFor(route);
  // wouter's raw navigate doesn't prepend the router base, so do it here.
  wouterNavigate(`${BASE}${path}`);
  if (anchor) {
    // Let the target page mount before scrolling to the anchor.
    window.setTimeout(() => scrollToId(anchor), 80);
  }
}

/** Which marketing nav item is active, derived from the wouter location. */
export function useActiveRoute(): RouteId {
  const [location] = useLocation();
  if (location === "/") return "home";
  if (location.startsWith("/features")) return "features";
  if (location.startsWith("/pricing")) return "pricing";
  if (location.startsWith("/about")) return "about";
  if (location.startsWith("/security")) return "security";
  if (location.startsWith("/compare")) return "compare";
  return "home";
}

/** Reveal-on-scroll: adds `.is-visible` to `.ml-reveal` elements. */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".ml-reveal:not(.is-visible)"),
    );
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
