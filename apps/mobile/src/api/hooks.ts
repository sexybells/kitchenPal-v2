import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AuthResult,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
} from "@kitchenpal/api-contract";
import { authApi } from "./auth";
import { useSessionStore } from "../store/session";

/** Query keys — centralised to keep cache invalidation consistent. */
export const queryKeys = {
  me: ["auth", "me"] as const,
};

/** Establish the session (persist tokens + set user) after any auth success. */
const useEstablishSession = () => {
  const signIn = useSessionStore((state) => state.signIn);
  return (result: AuthResult) => signIn(result);
};

export const useLogin = () => {
  const establish = useEstablishSession();
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: establish,
  });
};

export const useRegister = () => {
  const establish = useEstablishSession();
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: establish,
  });
};

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (input: ForgotPasswordInput) => authApi.forgotPassword(input),
  });

export const useGoogleSignIn = () => {
  const establish = useEstablishSession();
  return useMutation({
    mutationFn: (idToken: string) => authApi.loginWithGoogle({ idToken }),
    onSuccess: establish,
  });
};

export const useAppleSignIn = () => {
  const establish = useEstablishSession();
  return useMutation({
    mutationFn: (idToken: string) => authApi.loginWithApple({ idToken }),
    onSuccess: establish,
  });
};

/** Current user profile; enabled only while a session exists. */
export const useMe = () => {
  const status = useSessionStore((state) => state.status);
  const setUser = useSessionStore((state) => state.setUser);
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const user = await authApi.me();
      setUser(user);
      return user;
    },
    enabled: status === "authed",
  });
};
