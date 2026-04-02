const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Match custom-fetch: build-time env, else runtime injection from index.html (Render/Vercel). */
function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const w = (window as unknown as { VITE_API_BASE_URL?: string }).VITE_API_BASE_URL;
    if (typeof w === "string") {
      const t = w.trim().replace(/\/$/, "");
      if (t && !t.includes("%VITE_API_BASE_URL%")) return t;
    }
  }
  return "";
}

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const apiBase = resolveApiBase();
  if (apiBase) return `${apiBase}${clean}`;
  return `${BASE_PATH}${clean}`;
}
