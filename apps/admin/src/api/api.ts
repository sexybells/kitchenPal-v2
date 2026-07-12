import { ApiClient } from "./client";
import { env } from "@/lib/env";
import { sessionStore } from "@/auth/session-store";

/**
 * App-wide API client wired to the in-memory session store: it reads the
 * current admin tokens, persists rotated tokens, and clears the session when a
 * refresh fails.
 */
export const api = new ApiClient({
  baseUrl: env.apiBaseUrl,
  session: {
    getAccessToken: () => sessionStore.getState().accessToken,
    getRefreshToken: () => sessionStore.getState().refreshToken,
    onTokensRotated: (tokens) => sessionStore.setTokens(tokens),
    onAuthFailure: () => sessionStore.clear(),
  },
});
