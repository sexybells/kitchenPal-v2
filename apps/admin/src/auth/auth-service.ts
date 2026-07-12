import {
  authResultSchema,
  type AuthResult,
  type LoginInput,
} from "@kitchenpal/api-contract";
import { api } from "@/api/api";
import { ApiClientError } from "@/api/errors";
import { sessionStore } from "./session-store";

/** Thrown when valid credentials belong to a non-admin account. */
export const NOT_ADMIN_CODE = "NOT_ADMIN";

/**
 * Authenticate an admin. On success the account MUST hold the `admin` role;
 * a non-admin login is rejected and its freshly issued tokens are revoked
 * (best-effort) so no usable session leaks to the browser.
 */
export async function loginAsAdmin(input: LoginInput): Promise<AuthResult> {
  const result = await api.request("auth/login", {
    method: "POST",
    body: input,
    schema: authResultSchema,
    skipRefresh: true,
  });

  if (!result.user.roles.includes("admin")) {
    // Revoke the just-issued refresh token; never keep a non-admin session.
    await revokeQuietly(result.tokens.refreshToken);
    throw new ApiClientError({
      code: NOT_ADMIN_CODE,
      message: "This account does not have admin access.",
      status: 403,
    });
  }

  sessionStore.setSession(result.user, result.tokens);
  return result;
}

/** Revoke the refresh token server-side and clear local session material. */
export async function logout(): Promise<void> {
  const { refreshToken } = sessionStore.getState();
  if (refreshToken) await revokeQuietly(refreshToken);
  sessionStore.clear();
}

/** Best-effort refresh-token revocation; a failed logout still clears locally. */
async function revokeQuietly(refreshToken: string): Promise<void> {
  try {
    await api.request("auth/logout", {
      method: "POST",
      body: { refreshToken },
      skipRefresh: true,
    });
  } catch {
    // Ignore: the token expires on its own and local state is cleared anyway.
  }
}
