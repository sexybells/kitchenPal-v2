import type { ScopeContext } from "../common/scope/scope-context";
import type { AuthUser } from "../common/scope/auth-user";

/**
 * Request augmentations populated by platform middleware/guards:
 * - `requestId`: correlation id set by the request-id middleware.
 * - `user`: authenticated principal (populated by the auth phase).
 * - `scopeContext`: data-scope resolved by the scope guard.
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthUser;
      scopeContext?: ScopeContext;
    }
  }
}

export {};
