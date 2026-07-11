import type { SessionStatus } from "../store/session";

/** Auth-stack entry points and the app entry, depending on user history. */
export const LANGUAGE_GATE_ENTRY = "/(auth)/language" as const;
export const RETURNING_GUEST_ENTRY = "/(auth)/login" as const;
export const APP_ENTRY = "/(tabs)" as const;

export type RedirectTarget =
  | typeof LANGUAGE_GATE_ENTRY
  | typeof RETURNING_GUEST_ENTRY
  | typeof APP_ENTRY
  | null;

/**
 * Pure navigation guard: given the session status, whether the user is inside
 * the auth stack, and whether they've completed onboarding, return the route to
 * redirect to (or `null` to stay put). Side-effect-free so it unit-tests
 * directly. A returning guest (already onboarded) skips the language gate and
 * lands on login; a first-run guest starts at the language gate.
 */
export const resolveAuthRedirect = (
  status: SessionStatus,
  inAuthGroup: boolean,
  hasCompletedOnboarding: boolean,
): RedirectTarget => {
  if (status === "loading") return null;
  if (status === "guest" && !inAuthGroup) {
    return hasCompletedOnboarding ? RETURNING_GUEST_ENTRY : LANGUAGE_GATE_ENTRY;
  }
  if (status === "authed" && inAuthGroup) return APP_ENTRY;
  return null;
};
