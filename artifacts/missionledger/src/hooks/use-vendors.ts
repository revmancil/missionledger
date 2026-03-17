import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetVendors as useGenGet,
  useCreateVendor as useGenCreate,
  useUpdateVendor as useGenUpdate,
  useDeleteVendor as useGenDelete,
  getGetVendorsQueryKey
} from "@workspace/api-client-react";

export function useVendors() {
  return useGenGet();
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useGenCreate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetVendorsQueryKey() })
    }
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useGenUpdate({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetVendorsQueryKey() })
    }
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useGenDelete({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetVendorsQueryKey() })
    }
  });
}
