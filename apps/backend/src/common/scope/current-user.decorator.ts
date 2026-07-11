import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./auth-user";

/**
 * Injects the authenticated {@link AuthUser} from `request.user`. Identity comes
 * from the verified token, never from client-supplied ids.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<Request>().user;
  },
);
