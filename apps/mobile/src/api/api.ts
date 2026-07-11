import { ApiClient } from "./client";
import { useSessionStore } from "../store/session";

/** Public REST base URL. Overridable per environment via EXPO_PUBLIC_API_URL. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * App-wide API client wired to the session store: it reads the current tokens,
 * persists rotated tokens, and signs the user out when a refresh fails.
 */
export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  session: {
    getAccessToken: () => useSessionStore.getState().accessToken,
    getRefreshToken: () => useSessionStore.getState().refreshToken,
    onTokensRotated: (tokens) => useSessionStore.getState().setTokens(tokens),
    onAuthFailure: () => useSessionStore.getState().signOut(),
  },
});
