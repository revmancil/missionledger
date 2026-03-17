import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetDonations as useGenGet,
  useCreateDonation as useGenCreate,
  useUpdateDonation as useGenUpdate,
  useDeleteDonation as useGenDelete,
  getGetDonationsQueryKey
} from "@workspace/api-client-react";

export function useDonations() {
  return useGenGet();
}

export function useCreateDonation() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetDonationsQueryKey() })
    }
  });
}

export function useUpdateDonation() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetDonationsQueryKey() })
    }
  });
}

export function useDeleteDonation() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetDonationsQueryKey() })
    }
  });
}
