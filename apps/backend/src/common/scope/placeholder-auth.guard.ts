import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { ErrorCode } from "../http/error-codes";

/**
 * PLACEHOLDER authentication guard — replaced by real JWT verification in the
 * authentication phase.
 *
 * It performs no token verification. It only asserts that an upstream layer has
 * already populated `request.user`, so scope-protected routes can be wired now
 * and exercised in tests. Do NOT rely on this for security: it trusts whatever
 * set `request.user`. Apply it explicitly with `@UseGuards(PlaceholderAuthGuard)`
 * on routes that require a principal; it is intentionally not registered
 * globally so that public routes (e.g. health) stay open.
 */
@Injectable()
export class PlaceholderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: "Authentication required",
      });
    }
    return true;
  }
}
