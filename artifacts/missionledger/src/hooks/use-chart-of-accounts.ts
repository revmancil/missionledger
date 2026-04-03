import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";

export const CHART_OF_ACCOUNTS_QUERY_KEY = ["chart-of-accounts"] as const;

export interface ChartCoaAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE" | string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** GL balance when returned by GET /chart-of-accounts */
  balance?: number | null;
}

function coaAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("ml_token") : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJsonError(res: Response): Promise<never> {
  let msg = res.statusText;
  try {
    const j = await res.json();
    if (j?.error && typeof j.error === "string") msg = j.error;
  } catch {
    /* ignore */
  }
  throw new Error(msg);
}

export function useChartOfAccounts() {
  return useQuery({
    queryKey: CHART_OF_ACCOUNTS_QUERY_KEY,
    queryFn: async (): Promise<ChartCoaAccount[]> => {
      const res = await fetch(apiUrl("/api/chart-of-accounts"), {
        credentials: "include",
        headers: coaAuthHeaders(),
      });
      if (!res.ok) await parseJsonError(res);
      return res.json();
    },
  });
}

export function useCreateChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      code: string;
      name: string;
      type: string;
      description?: string;
      parentId?: string | null;
      sortOrder?: number;
    }) => {
      const res = await fetch(apiUrl("/api/chart-of-accounts"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...coaAuthHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) await parseJsonError(res);
      return res.json() as Promise<ChartCoaAccount>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHART_OF_ACCOUNTS_QUERY_KEY }),
  });
}

export function useUpdateChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      data: {
        name?: string;
        code?: string;
        description?: string | null;
        isActive?: boolean;
        parentId?: string | null;
        sortOrder?: number;
      };
    }) => {
      const res = await fetch(apiUrl(`/api/chart-of-accounts/${vars.id}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...coaAuthHeaders() },
        body: JSON.stringify(vars.data),
      });
      if (!res.ok) await parseJsonError(res);
      return res.json() as Promise<ChartCoaAccount>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHART_OF_ACCOUNTS_QUERY_KEY }),
  });
}

export function useDeleteChartAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/chart-of-accounts/${id}`), {
        method: "DELETE",
        credentials: "include",
        headers: coaAuthHeaders(),
      });
      if (!res.ok) await parseJsonError(res);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHART_OF_ACCOUNTS_QUERY_KEY }),
  });
}
