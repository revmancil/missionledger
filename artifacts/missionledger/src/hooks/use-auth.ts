import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetMe, 
  useLogin as useGenLogin, 
  useLogout as useGenLogout,
  useRegister as useGenRegister,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { useLocation } from "wouter";

export function useAuth() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
    }
  });

  const loginMutation = useGenLogin({
    mutation: {
      onSuccess: (data) => {
        qc.setQueryData(getGetMeQueryKey(), data);
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

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}
