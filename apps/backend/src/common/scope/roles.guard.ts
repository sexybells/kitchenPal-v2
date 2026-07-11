import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@kitchenpal/api-contract";
import type { Request } from "express";
import { ErrorCode } from "../http/error-codes";
import { ROLES_METADATA_KEY } from "./roles.decorator";

/**
 * Enforces `@Roles(...)`: the authenticated user must hold at least one of the
 * required roles. Runs after the global JWT guard, so `request.user` is present
 * for any route that also requires a role. Routes without `@Roles` pass through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Authentication required",
      });
    }

    if (!required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: "You do not have permission to perform this action",
      });
    }
    return true;
  }
}
