import { apiUrl } from "./api-base";

type JsonObject = Record<string, unknown>;

function bearerHeaders(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const token = localStorage.getItem("ml_token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function authJsonFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...(options.headers as Record<string, string> | undefined),
    ...(bearerHeaders() ?? {}),
  };
  const url = path.startsWith("http") ? path : apiUrl(path.startsWith("/") ? path : `/${path}`);
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });
  return response;
}

export async function readJsonSafe<T = JsonObject>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function logApiFailure(endpoint: string, response: Response, body: unknown): void {
  console.error(`[API] ${endpoint} failed`, {
    status: response.status,
    statusText: response.statusText,
    body,
  });
}
