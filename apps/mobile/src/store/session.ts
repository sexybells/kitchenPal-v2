import { create } from "zustand";
import type {
  AuthResult,
  TokenPair,
  UserResponse,
} from "@kitchenpal/api-contract";
import { authApi } from "../api/auth";
import {
  clearStoredTokens,
  persistTokens,
  readStoredTokens,
} from "./secure-storage";

/**
 * Auth lifecycle:
 *  - `loading`   → hydrating tokens from secure store on cold start.
 *  - `authed`    → a valid session exists (tokens present, user may lazy-load).
 *  - `guest`     → no session; the auth stack is shown.
 */
export type SessionStatus = "loading" | "authed" | "guest";

interface SessionState {
  status: SessionStatus;
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Read persisted tokens once at startup and set the initial status. */
  hydrate: () => Promise<void>;
  /** Establish a session from a successful auth result (persists tokens). */
  signIn: (result: AuthResult) => Promise<void>;
  /** Replace the token pair after a rotation (persists tokens). */
  setTokens: (tokens: TokenPair) => Promise<void>;
  /** Attach/refresh the current user profile without touching tokens. */
  setUser: (user: UserResponse) => void;
  /** Tear down the session and wipe persisted tokens. */
  signOut: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,

  hydrate: async () => {
    const tokens = await readStoredTokens();
    if (tokens) {
      set({
        status: "authed",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } else {
      set({ status: "guest", accessToken: null, refreshToken: null });
    }
  },

  signIn: async (result) => {
    await persistTokens(result.tokens);
    set({
      status: "authed",
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  },

  setTokens: async (tokens) => {
    await persistTokens(tokens);
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  },

  setUser: (user) => set({ user }),

  signOut: async () => {
    // Best-effort server-side revoke of the refresh-token family before wiping
    // local state. Read the token first; swallow errors so an offline device
    // can always sign out locally.
    const { refreshToken } = get();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Network/endpoint failure must not block local sign-out.
      }
    }
    await clearStoredTokens();
    set({
      status: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  },
}));
