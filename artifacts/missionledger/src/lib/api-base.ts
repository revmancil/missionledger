const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE) return `${API_BASE}${clean}`;
  return `${BASE_PATH}${clean}`;
}
