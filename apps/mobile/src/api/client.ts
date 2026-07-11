import type { z } from "zod";
import {
  errorEnvelopeSchema,
  successEnvelope,
  tokenPairSchema,
  type TokenPair,
} from "@kitchenpal/api-contract";
import { ApiClientError } from "./errors";

/** Bridge to the session so the client stays decoupled from React/Zustand. */
export interface SessionBridge {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRotated: (tokens: TokenPair) => void | Promise<void>;
  onAuthFailure: () => void | Promise<void>;
}

export interface ApiClientConfig {
  baseUrl: string;
  session: SessionBridge;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions<T extends z.ZodTypeAny> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Schema for the envelope `data`; when present the result is validated. */
  schema?: T;
  /** Attach the bearer token and enable the 401→refresh→retry path. */
  auth?: boolean;
  signal?: AbortSignal;
}

type Result<T extends z.ZodTypeAny> = T extends z.ZodTypeAny ? z.infer<T> : unknown;

/**
 * Typed fetch client that unwraps the KitchenPal response envelope, validates
 * `data` with the api-contract zod schemas, and transparently rotates the
 * access token on a 401 (single-flight; a failed refresh signs the user out).
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly session: SessionBridge;
  private readonly fetchImpl: typeof fetch;
  /** In-flight refresh shared across concurrent 401s (single-flight guard). */
  private refreshInFlight: Promise<string> | null = null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.session = config.session;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async request<T extends z.ZodTypeAny>(
    path: string,
    options: RequestOptions<T> = {},
  ): Promise<Result<T>> {
    const response = await this.send(path, options, false);
    return this.parse(response, options.schema);
  }

  private async send<T extends z.ZodTypeAny>(
    path: string,
    options: RequestOptions<T>,
    isRetry: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.auth) {
      const token = this.session.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, "")}`, {
        method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (cause) {
      throw ApiClientError.network(
        cause instanceof Error ? cause.message : "Network request failed",
      );
    }

    // Transparent refresh: only for authed calls, only once per request.
    if (response.status === 401 && options.auth && !isRetry) {
      await this.refreshAccessToken();
      return this.send(path, options, true);
    }

    // The freshly-rotated token was itself rejected — the session is no longer
    // valid, so sign the user out rather than surfacing a bare 401.
    if (response.status === 401 && options.auth && isRetry) {
      await this.session.onAuthFailure();
    }

    return response;
  }

  private async parse<T extends z.ZodTypeAny>(
    response: Response,
    schema?: T,
  ): Promise<Result<T>> {
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(payload);
      if (parsed.success) {
        throw ApiClientError.fromEnvelope(parsed.data.error, response.status);
      }
      throw new ApiClientError({
        code: "HTTP_ERROR",
        message: `Request failed with status ${response.status}`,
        status: response.status,
      });
    }

    if (!schema) {
      // No schema requested: return the raw `data` field without validation.
      const envelope = payload as { data?: unknown } | null;
      return (envelope?.data ?? null) as Result<T>;
    }

    const validated = successEnvelope(schema).safeParse(payload);
    if (!validated.success) {
      throw ApiClientError.invalidResponse("Response did not match the expected shape");
    }
    const envelope = validated.data as unknown as { data: unknown };
    return envelope.data as Result<T>;
  }

  /** Single-flight token rotation shared by every concurrent 401. */
  private refreshAccessToken(): Promise<string> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const refreshToken = this.session.getRefreshToken();
      if (!refreshToken) {
        await this.session.onAuthFailure();
        throw new ApiClientError({
          code: "SESSION_EXPIRED",
          message: "No refresh token available",
          status: 401,
        });
      }

      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        await this.session.onAuthFailure();
        throw ApiClientError.network("Token refresh request failed");
      }

      const payload: unknown = await response.json().catch(() => null);
      const validated = successEnvelope(tokenPairSchema).safeParse(payload);
      if (!response.ok || !validated.success) {
        await this.session.onAuthFailure();
        throw new ApiClientError({
          code: "SESSION_EXPIRED",
          message: "Token refresh failed",
          status: 401,
        });
      }

      // The refresh token rotates — persist the NEW pair.
      const rotated = (validated.data as unknown as { data: TokenPair }).data;
      await this.session.onTokensRotated(rotated);
      return rotated.accessToken;
    })().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }
}
