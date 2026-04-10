import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authJsonFetch } from "@/lib/auth-fetch";
import { CHART_OF_ACCOUNTS_QUERY_KEY } from "@/hooks/use-chart-of-accounts";

export interface FundBalance {
  id: string;
  name: string;
  fundType: string;
  balance: number;
}

export interface BankBalance {
  id: string;
  name: string;
  balance: number;
}

export interface FinancialSummary {
  totalCash: number;
  ytdRevenue: number;
  ytdExpenses: number;
  netPosition: number;
  txCount: number;
  bankBalances: BankBalance[];
  fundBalances: FundBalance[];
  asOf: string;
}

interface FinancialSyncContextValue {
  summary: FinancialSummary | null;
  isLoading: boolean;
  version: number;
  refetch: () => void;
}

const FinancialSyncContext = createContext<FinancialSyncContextValue>({
  summary: null,
  isLoading: false,
  version: 0,
  refetch: () => {},
});

export function FinancialSyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsLoading(true);
    try {
      const res = await authJsonFetch("api/financial-summary", {
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const data: FinancialSummary = await res.json();
      setSummary(data);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [version, fetchSummary]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CHART_OF_ACCOUNTS_QUERY_KEY });
    setVersion((v) => v + 1);
  }, [queryClient]);

  return (
    <FinancialSyncContext.Provider value={{ summary, isLoading, version, refetch }}>
      {children}
    </FinancialSyncContext.Provider>
  );
}

export function useFinancialSync() {
  return useContext(FinancialSyncContext);
}
