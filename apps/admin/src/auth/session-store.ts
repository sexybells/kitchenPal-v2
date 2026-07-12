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

// Snapshots are replaced (never mutated in place) so `useSyncExternalStore`
// detects every change by reference and re-renders subscribers reliably.
let state: SessionState = {
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
    state = {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    emit();
  },

  /** Persist a rotated token pair without disturbing the current user. */
  setTokens(tokens: TokenPair): void {
    state = {
      ...state,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    emit();
  },

  /**
   * Replace the current session user (e.g. after an admin changes their OWN
   * roles) so role-dependent guards re-evaluate without a full page reload.
   */
  setUser(user: UserResponse): void {
    state = { ...state, user };
    emit();
  },

  /** Clear all session material (logout / auth failure). */
  clear(): void {
    state = { user: null, accessToken: null, refreshToken: null };
    emit();
  },
};
