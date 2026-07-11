import type { ApiError } from "@kitchenpal/api-contract";

/**
 * Normalised client-side error. Carries the server `code` (for i18n / branching)
 * plus the HTTP status. Network and parse failures are represented with
 * synthetic codes so callers can handle every failure mode uniformly.
 */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }

  static fromEnvelope(error: ApiError, status: number): ApiClientError {
    return new ApiClientError({
      code: error.code,
      message: error.message,
      status,
      details: error.details,
    });
  }

  static network(message: string): ApiClientError {
    return new ApiClientError({ code: "NETWORK_ERROR", message, status: 0 });
  }

  static invalidResponse(message: string): ApiClientError {
    return new ApiClientError({
      code: "INVALID_RESPONSE",
      message,
      status: 0,
    });
  }
}
