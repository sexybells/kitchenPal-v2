import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { DataScope } from "@kitchenpal/api-contract";
import type { Request } from "express";
import type { ScopeContext } from "./scope-context";

/** Metadata key holding the required {@link DataScope} for a handler. */
export const SCOPE_METADATA_KEY = "kitchenpal:scope";

/** Metadata key marking a handler as household-preferred (see {@link HouseholdScope}). */
export const HOUSEHOLD_PREFERRED_METADATA_KEY = "kitchenpal:household-preferred";

/**
 * Declares the data-scope a route operates in. The scope guard reads this to
 * verify the caller may act in that scope and to build the {@link ScopeContext}.
 */
export const Scope = (scope: DataScope) =>
  SetMetadata(SCOPE_METADATA_KEY, scope);

/**
 * Declares a route whose scope is resolved from the caller's context: it runs in
 * `household` scope when the caller has an active household they are a VERIFIED
 * current member of, and otherwise falls back to `personal` scope. This is how a
 * feature (pantry, recipes, meal-plans, shopping, spending) shares data among the
 * members of a household while staying first-class for solo/personal users.
 *
 * The fall-back to personal is fail-SAFE, not a 403: a caller with no active
 * household — or whose membership was revoked (a stale token) — simply acts on
 * their own private data and never on a household's. The household id is taken
 * only from the verified membership, never from a client-supplied value.
 */
export const HouseholdScope = () =>
  SetMetadata(HOUSEHOLD_PREFERRED_METADATA_KEY, true);

/** Injects the resolved {@link ScopeContext} (set by the scope guard). */
export const CurrentScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScopeContext | undefined => {
    return ctx.switchToHttp().getRequest<Request>().scopeContext;
  },
);
