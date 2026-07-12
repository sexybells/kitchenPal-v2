import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Admin data is short-lived and mutation-heavy, so
 * defaults stay conservative: no aggressive refetch storms, one retry.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
