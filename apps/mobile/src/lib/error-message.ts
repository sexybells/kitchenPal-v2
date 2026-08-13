import type { TFunction } from "i18next";
import { ApiClientError } from "../api/errors";

type ErrorKey =
  | "errors.network"
  | "errors.server"
  | "errors.invalidResponse"
  | "errors.sessionExpired"
  | "errors.invalidCredentials"
  | "errors.accountSuspended"
  | "errors.validation"
  | "errors.rateLimited"
  | "errors.emailTaken"
  | "errors.conflict"
  | "errors.staleWrite"
  | "errors.forbidden"
  | "errors.notFound"
  | "errors.unavailable";

// Maps a client synthetic / backend error code to a localized message key.
// Multiple backend aliases fold onto one key so copy stays consistent. Every
// backend `ErrorCode` (see backend common/http/error-codes.ts) has an entry so
// the resolver never falls through to a raw English server string.
const CODE_TO_KEY: Record<string, ErrorKey> = {
  // Client-side synthetic codes (see api/client.ts).
  NETWORK_ERROR: "errors.network",
  INVALID_RESPONSE: "errors.invalidResponse",
  HTTP_ERROR: "errors.server",
  SESSION_EXPIRED: "errors.sessionExpired",
  // Common backend auth codes.
  INVALID_CREDENTIALS: "errors.invalidCredentials",
  ACCOUNT_SUSPENDED: "errors.accountSuspended",
  UNAUTHENTICATED: "errors.sessionExpired",
  UNAUTHORIZED: "errors.sessionExpired",
  TOKEN_EXPIRED: "errors.sessionExpired",
  // Validation.
  VALIDATION_ERROR: "errors.validation",
  VALIDATION_FAILED: "errors.validation",
  BAD_REQUEST: "errors.validation",
  // Rate limiting (RATE_LIMIT_EXCEEDED is the backend's canonical code).
  RATE_LIMITED: "errors.rateLimited",
  TOO_MANY_REQUESTS: "errors.rateLimited",
  RATE_LIMIT_EXCEEDED: "errors.rateLimited",
  // Email-taken is a DISTINCT backend code; a plain CONFLICT is unrelated.
  EMAIL_ALREADY_EXISTS: "errors.emailTaken",
  EMAIL_IN_USE: "errors.emailTaken",
  CONFLICT: "errors.conflict",
  OPTIMISTIC_LOCK_CONFLICT: "errors.staleWrite",
  // Remaining backend codes — localized so nothing leaks raw English.
  FORBIDDEN: "errors.forbidden",
  NOT_FOUND: "errors.notFound",
  SERVICE_UNAVAILABLE: "errors.unavailable",
  INTERNAL_SERVER_ERROR: "errors.server",
};

/**
 * Turn any thrown error into a user-facing, localized string — never leaking a
 * raw synthetic/English message to the UI. Returns `null` when there is no
 * error. Known codes resolve to a translated message; unmapped codes fall back
 * to a generic localized message (never the raw server string).
 */
export function resolveErrorMessage(error: unknown, t: TFunction): string | null {
  if (!error) return null;

  if (error instanceof ApiClientError) {
    const key = CODE_TO_KEY[error.code];
    if (key) return t(key);
    return t("errors.server");
  }

  return t("errors.server");
}
