import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ErrorCode } from "../../../common/http/error-codes";
import { IS_PUBLIC_KEY } from "../../../common/scope/public.decorator";
import { TokenService } from "../services/token.service";

/**
 * Global authentication guard. Verifies the `Authorization: Bearer <jwt>` access
 * token and populates `request.user` from the verified claims — identity always
 * comes from the token, never the request body. Routes marked `@Public()` bypass
 * it. This replaces the placeholder guard from the core platform.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "A bearer access token is required",
      });
    }

    const payload = this.tokens.verifyAccessToken(header.slice("Bearer ".length));
    request.user = {
      id: payload.sub,
      roles: payload.roles,
      activeHouseholdId: payload.activeHouseholdId,
    };
    return true;
  }
}
