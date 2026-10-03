/**
 * Tiny hash-based router + scroll utilities for the marketing prototype.
 * Hash routing keeps previews shareable and reload-safe in the sandbox.
 */
import { useEffect, useState } from "react";
import type { RouteId } from "./data";

const ROUTE_IDS: RouteId[] = [
  "home",
  "features",
  "pricing",
  "about",
  "security",
  "compare",
];

function parseHash(hash: string): { route: RouteId; anchor?: string } {
  const raw = hash.replace(/^#\/?/, ""); // "pricing" | "features#faq"
  const [pathPart, anchor] = raw.split("#");
  const clean = (pathPart || "").replace(/\/$/, "");
  const route = (ROUTE_IDS as string[]).includes(clean)
    ? (clean as RouteId)
    : "home";
  return { route, anchor: anchor || undefined };
}

/** Navigate programmatically (updates the hash, which drives the router). */
export function navigate(route: RouteId, anchor?: string) {
  const next = `#/${route === "home" ? "" : route}${anchor ? `#${anchor}` : ""}`;
  if (window.location.hash === next) {
    // Same hash: still honor an anchor scroll request.
    if (anchor) scrollToId(anchor);
    return;
  }
  window.location.hash = next;
}

/** Smoothly scroll to an element by id, accounting for the sticky header. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 84;
  window.scrollTo({ top, behavior: "smooth" });
}

export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() =>
    parseHash(window.location.hash).route,
  );

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash).route);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Scroll behavior on route change / anchor.
  useEffect(() => {
    const { anchor } = parseHash(window.location.hash);
    if (anchor) {
      // Wait for the target page to mount before scrolling.
      const t = window.setTimeout(() => scrollToId(anchor), 60);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    return undefined;
  }, [route]);

  return route;
}

/** The href for a Link — used as a progressive-enhancement fallback. */
export function hrefFor(route: RouteId, anchor?: string): string {
  return `#/${route === "home" ? "" : route}${anchor ? `#${anchor}` : ""}`;
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
