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

/**
 * Declares the data-scope a route operates in. The scope guard reads this to
 * verify the caller may act in that scope and to build the {@link ScopeContext}.
 */
export const Scope = (scope: DataScope) =>
  SetMetadata(SCOPE_METADATA_KEY, scope);

/** Injects the resolved {@link ScopeContext} (set by the scope guard). */
export const CurrentScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScopeContext | undefined => {
    return ctx.switchToHttp().getRequest<Request>().scopeContext;
  },
);
