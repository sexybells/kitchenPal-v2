import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { DataScope } from "@kitchenpal/api-contract";
import type { Request } from "express";
import { ErrorCode } from "../http/error-codes";
import { SCOPE_METADATA_KEY } from "./scope.decorator";

/**
 * Resolves and enforces the data-scope declared by `@Scope()`:
 * - `personal`: any authenticated user, scoped to their own documents.
 * - `household`: requires an active household on the principal.
 * - `system`: server-owned data, restricted to admins.
 *
 * Routes without `@Scope()` pass through untouched. The resolved context is
 * attached to `request.scopeContext` for repositories to consume.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<DataScope | undefined>(
      SCOPE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Authentication required",
      });
    }

    if (required === "household" && !user.activeHouseholdId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "An active household is required for this action",
      });
    }

    if (required === "system" && !user.roles.includes("admin")) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "System scope is restricted to administrators",
      });
    }

    request.scopeContext = {
      scope: required,
      userId: user.id,
      householdId: required === "household" ? user.activeHouseholdId : null,
    };

    return true;
  }
}
