import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetBills as useGenGet,
  useCreateBill as useGenCreate,
  useUpdateBill as useGenUpdate,
  useDeleteBill as useGenDelete,
  getGetBillsQueryKey
} from "@workspace/api-client-react";

export function useBills() {
  return useGenGet();
}

export function useCreateBill() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBillsQueryKey() })
    }
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBillsQueryKey() })
    }
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBillsQueryKey() })
    }
  });
}
