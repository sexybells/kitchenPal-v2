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
