import type { DataScope } from "@kitchenpal/api-contract";

/**
 * Resolved data-scope for a request, produced by the scope guard and consumed
 * by repositories to build their query filters. Mirrors the shared
 * `dataScopeSchema` (`personal | household | system`).
 */
export interface ScopeContext {
  scope: DataScope;
  userId: string;
  householdId?: string | null;
}

/**
 * A personal scope pinned to a user, regardless of any household they are acting
 * in. Used for data that stays per-user even inside a household — e.g. dietary
 * preferences, whose allergens must never be blended across members.
 */
export function toPersonalScope(userId: string): ScopeContext {
  return { scope: "personal", userId, householdId: null };
}
