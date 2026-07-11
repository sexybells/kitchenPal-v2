import type { TFunction } from "i18next";
import { ApiClientError } from "../api/errors";

type ErrorKey =
  | "errors.network"
  | "errors.server"
  | "errors.invalidResponse"
  | "errors.sessionExpired"
  | "errors.invalidCredentials"
  | "errors.validation"
  | "errors.rateLimited"
  | "errors.emailTaken";

// Maps a client synthetic / backend error code to a localized message key.
// Multiple backend aliases fold onto one key so copy stays consistent.
const CODE_TO_KEY: Record<string, ErrorKey> = {
  // Client-side synthetic codes (see api/client.ts).
  NETWORK_ERROR: "errors.network",
  INVALID_RESPONSE: "errors.invalidResponse",
  HTTP_ERROR: "errors.server",
  SESSION_EXPIRED: "errors.sessionExpired",
  // Common backend auth codes.
  INVALID_CREDENTIALS: "errors.invalidCredentials",
  UNAUTHENTICATED: "errors.sessionExpired",
  TOKEN_EXPIRED: "errors.sessionExpired",
  VALIDATION_ERROR: "errors.validation",
  VALIDATION_FAILED: "errors.validation",
  BAD_REQUEST: "errors.validation",
  RATE_LIMITED: "errors.rateLimited",
  TOO_MANY_REQUESTS: "errors.rateLimited",
  EMAIL_ALREADY_EXISTS: "errors.emailTaken",
  EMAIL_IN_USE: "errors.emailTaken",
  CONFLICT: "errors.emailTaken",
};

/**
 * Turn any thrown error into a user-facing, localized string — never leaking a
 * raw synthetic/English message to the UI. Returns `null` when there is no
 * error. Known codes resolve to a translated message; unknown codes fall back
 * to the server-provided message, then to a generic localized message.
 */
export function resolveErrorMessage(error: unknown, t: TFunction): string | null {
  if (!error) return null;

  if (error instanceof ApiClientError) {
    const key = CODE_TO_KEY[error.code];
    if (key) return t(key);
    const serverMessage = error.message.trim();
    return serverMessage.length > 0 ? serverMessage : t("errors.server");
  }

  return t("errors.server");
}
