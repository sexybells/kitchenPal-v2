import type { FilterQuery } from "mongoose";
import type { ScopeContext } from "../scope/scope-context";

/**
 * Builds the Mongo filter fragment that restricts a query to the caller's scope:
 * - `personal`: documents the user owns (`createdBy`).
 * - `household`: documents belonging to the active household.
 * - `system`: server-owned global documents.
 *
 * Returned as a plain fragment so callers can merge it with soft-delete and
 * business filters.
 */
export function buildScopeFilter(
  context: ScopeContext,
): Record<string, unknown> {
  switch (context.scope) {
    case "personal":
      return { scope: "personal", createdBy: context.userId };
    case "household":
      return { scope: "household", householdId: context.householdId };
    case "system":
      return { scope: "system" };
  }
}

/** Typed variant for use directly as a Mongoose {@link FilterQuery}. */
export function scopeFilterFor<T>(context: ScopeContext): FilterQuery<T> {
  return buildScopeFilter(context) as FilterQuery<T>;
}
