import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetFunds as useGenGet,
  useCreateFund as useGenCreate,
  useUpdateFund as useGenUpdate,
  useDeleteFund as useGenDelete,
  getGetFundsQueryKey
} from "@workspace/api-client-react";

export function useFunds() {
  return useGenGet();
}

export function useCreateFund() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetFundsQueryKey() })
    }
  });
}

export function useUpdateFund() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetFundsQueryKey() })
    }
  });
}

export function useDeleteFund() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetFundsQueryKey() })
    }
  });
}
