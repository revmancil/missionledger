import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetExpenses as useGenGet,
  useCreateExpense as useGenCreate,
  useUpdateExpense as useGenUpdate,
  useDeleteExpense as useGenDelete,
  getGetExpensesQueryKey
} from "@workspace/api-client-react";

export function useExpenses() {
  return useGenGet();
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() })
    }
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() })
    }
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() })
    }
  });
}
