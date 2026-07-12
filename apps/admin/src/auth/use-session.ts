import { useSyncExternalStore } from "react";
import { sessionStore, type SessionState } from "./session-store";

/** Subscribe a component to the in-memory session (re-renders on change). */
export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
}

/** True when an authenticated admin session is present. */
export function useIsAuthenticated(): boolean {
  const { accessToken, user } = useSession();
  return Boolean(accessToken && user);
}
