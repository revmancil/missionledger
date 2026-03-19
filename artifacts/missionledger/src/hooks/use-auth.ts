import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useGetMe,
  useLogin as useGenLogin,
  useLogout as useGenLogout,
  useRegister as useGenRegister,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Request failed");
  }
  return res.json();
}

export function useAuth() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useGetMe({
    query: { retry: false }
  });

  const { data: myOrgs = [] } = useQuery<any[]>({
    queryKey: ["my-orgs"],
    queryFn: () => apiFetch("/api/auth/my-orgs"),
    enabled: !!user,
    staleTime: 60000,
  });

  const loginMutation = useGenLogin({
    mutation: {
      onSuccess: (data) => {
        qc.setQueryData(getGetMeQueryKey(), data);
        qc.invalidateQueries({ queryKey: ["my-orgs"] });
        setLocation("/dashboard");
      }
    }
  });

  const registerMutation = useGenRegister({
    mutation: {
      onSuccess: (data) => {
        qc.setQueryData(getGetMeQueryKey(), data);
        setLocation("/dashboard");
      }
    }
  });

  const logoutMutation = useGenLogout({
    mutation: {
      onSuccess: () => {
        qc.setQueryData(getGetMeQueryKey(), null);
        qc.clear();
        setLocation("/");
      }
    }
  });

  async function switchOrg(companyId: string) {
    const data = await apiFetch("/api/auth/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    qc.setQueryData(getGetMeQueryKey(), data);
    qc.clear();
    qc.invalidateQueries();
    setLocation("/dashboard");
  }

  async function exitImpersonation() {
    const data = await apiFetch("/api/master-admin/exit-impersonation", { method: "POST" });
    qc.setQueryData(getGetMeQueryKey(), data);
    qc.clear();
    qc.invalidateQueries();
    window.location.href = `${BASE}/admin`;
  }

  return {
    user: user as any,
    isLoading,
    isAuthenticated: !!user && !error,
    isPlatformAdmin: !!(user as any)?.isPlatformAdmin,
    isImpersonating: !!(user as any)?.impersonatedBy,
    myOrgs,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    switchOrg,
    exitImpersonation,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}
