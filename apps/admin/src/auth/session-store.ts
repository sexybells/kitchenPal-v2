import type { TokenPair, UserResponse } from "@kitchenpal/api-contract";

/**
 * In-memory admin session. Tokens are held ONLY in module memory — never in
 * localStorage/sessionStorage — so a stolen-XSS payload cannot read them from
 * persistent storage, and a full page reload deliberately drops the session
 * (short admin sessions; re-login is expected). The refresh token lives here
 * too, enabling silent access-token rotation within a single tab lifetime.
 */
export interface SessionState {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
}

const state: SessionState = {
  user: null,
  accessToken: null,
  refreshToken: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const sessionStore = {
  getState(): SessionState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Establish an authenticated session (after a verified admin login). */
  setSession(user: UserResponse, tokens: TokenPair): void {
    state.user = user;
    state.accessToken = tokens.accessToken;
    state.refreshToken = tokens.refreshToken;
    emit();
  },

  /** Persist a rotated token pair without disturbing the current user. */
  setTokens(tokens: TokenPair): void {
    state.accessToken = tokens.accessToken;
    state.refreshToken = tokens.refreshToken;
    emit();
  },

  /** Clear all session material (logout / auth failure). */
  clear(): void {
    state.user = null;
    state.accessToken = null;
    state.refreshToken = null;
    emit();
  },
};
