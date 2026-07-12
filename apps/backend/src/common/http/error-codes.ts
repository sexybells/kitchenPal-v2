import { HttpStatus } from "@nestjs/common";

/**
 * Stable machine error codes returned in the error envelope's `error.code`.
 * Clients switch on these; keep them stable across releases.
 *
 * `OPTIMISTIC_LOCK_CONFLICT` (HTTP 409) is the optimistic-concurrency contract:
 * a write was attempted against a stale `version`. The client should re-read the
 * document, rebase its change on the current `version`, and retry.
 *
 * `EMAIL_ALREADY_EXISTS` (HTTP 409) is the SPECIFIC "email is taken" conflict for
 * sign-up/social-link. It is distinct from the generic `CONFLICT` so clients can
 * show an "email already in use" message without mistaking an unrelated 409
 * (e.g. a pantry-scan-confirm or budget-overlap conflict) for an email clash.
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  OPTIMISTIC_LOCK_CONFLICT: "OPTIMISTIC_LOCK_CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Default machine code for an HTTP status when a handler did not specify one. */
export function defaultCodeForStatus(status: number): ErrorCodeValue {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.BAD_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return ErrorCode.INTERNAL_SERVER_ERROR;
  }
}
