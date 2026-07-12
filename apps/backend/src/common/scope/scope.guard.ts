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
import { MembershipVerifier } from "./membership";
import { SCOPE_METADATA_KEY } from "./scope.decorator";

/**
 * Resolves and enforces the data-scope declared by `@Scope()`:
 * - `personal`: any authenticated user, scoped to their own documents.
 * - `household`: requires an active household the caller is a VERIFIED active
 *   member of — the token's `activeHouseholdId` is never trusted on its own.
 * - `system`: server-owned data, restricted to admins.
 *
 * Routes without `@Scope()` pass through untouched. The resolved context is
 * attached to `request.scopeContext` for repositories to consume. Non-HTTP
 * contexts (e.g. the chat WebSocket gateway, which authenticates itself) bypass
 * this guard.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membership: MembershipVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") {
      return true;
    }

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

    if (required === "household") {
      if (!user.activeHouseholdId) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: "An active household is required for this action",
        });
      }
      // Fail closed: the household scope is granted only when the principal is a
      // verified CURRENT active member, never from the token claim alone.
      const isMember = await this.membership.isActiveMember(
        user.id,
        user.activeHouseholdId,
      );
      if (!isMember) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: "You are not an active member of this household",
        });
      }
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
