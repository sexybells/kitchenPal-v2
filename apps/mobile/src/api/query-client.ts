import { QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "./errors";

/**
 * Shared TanStack Query client. Auth/validation errors are not retried (they
 * won't succeed on repeat); transient network/server errors get two retries.
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiClientError) {
            if (error.status === 401 || error.status === 400) return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
