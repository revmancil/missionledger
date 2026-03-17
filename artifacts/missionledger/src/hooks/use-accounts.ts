import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetAccounts as useGenGet,
  useCreateAccount as useGenCreate,
  useUpdateAccount as useGenUpdate,
  useDeleteAccount as useGenDelete,
  getGetAccountsQueryKey
} from "@workspace/api-client-react";

export function useAccounts() {
  return useGenGet();
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetAccountsQueryKey() })
    }
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetAccountsQueryKey() })
    }
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetAccountsQueryKey() })
    }
  });
}
