import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetFunds as useGenGet,
  useCreateFund as useGenCreate,
  useUpdateFund as useGenUpdate,
  useDeleteFund as useGenDelete,
  getGetFundsQueryKey
} from "@workspace/api-client-react";
import { CHART_OF_ACCOUNTS_QUERY_KEY } from "@/hooks/use-chart-of-accounts";

/** Fund type (and name) feed GL rollups into net-asset equity lines — refresh COA + statements after fund CRUD. */
function invalidateFundDependentFinancials(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: getGetFundsQueryKey() });
  void qc.invalidateQueries({ queryKey: CHART_OF_ACCOUNTS_QUERY_KEY });
  void qc.invalidateQueries({ queryKey: ["/api/reports/balance-sheet"] });
  void qc.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
  void qc.invalidateQueries({ queryKey: ["/api/reports/cash-flow"] });
}

export function useFunds() {
  return useGenGet();
}

export function useCreateFund() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => invalidateFundDependentFinancials(qc),
    }
  });
}

export function useUpdateFund() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => invalidateFundDependentFinancials(qc),
    }
  });
}

export function useDeleteFund() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => invalidateFundDependentFinancials(qc),
    }
  });
}
