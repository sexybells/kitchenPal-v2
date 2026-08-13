import type { z } from "zod";
import {
  errorEnvelopeSchema,
  paginatedEnvelope,
  successEnvelope,
  tokenPairSchema,
  type PageInfo,
  type TokenPair,
} from "@kitchenpal/api-contract";
import { ApiClientError } from "./errors";

/** Bridge to the session so the client stays decoupled from React state. */
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

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface RequestOptions<T extends z.ZodTypeAny> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  /** Schema for the envelope `data`; when present the result is validated. */
  schema?: T;
  /** Skip the 401→refresh→retry path (e.g. the login / logout calls). */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

/** A validated, unwrapped page: the item list plus its cursor page info. */
export interface Page<T> {
  items: T[];
  page: PageInfo;
}

type Result<T extends z.ZodTypeAny> = T extends z.ZodTypeAny
  ? z.infer<T>
  : unknown;

/**
 * Typed fetch client for the admin console. It unwraps the KitchenPal response
 * envelope, validates `data` with the api-contract zod schemas, and
 * transparently rotates the (short-lived admin) access token on a 401
 * (single-flight; a failed refresh signs the admin out). Every admin call is
 * authenticated, so auth is always attached.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly session: SessionBridge;
  private readonly fetchImpl: typeof fetch;
  private refreshInFlight: Promise<string> | null = null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.session = config.session;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** Perform a request and return the validated envelope `data`. */
  async request<T extends z.ZodTypeAny>(
    path: string,
    options: RequestOptions<T> = {},
  ): Promise<Result<T>> {
    const response = await this.send(path, options, false);
    return this.parse(response, options.schema);
  }

  /** Perform a paginated request, validating the `{ data, meta.page }` shape. */
  async requestPage<T extends z.ZodTypeAny>(
    path: string,
    item: T,
    options: Omit<RequestOptions<T>, "schema"> = {},
  ): Promise<Page<z.infer<T>>> {
    const response = await this.send(path, options, false);
    const payload: unknown = await response.json().catch(() => null);
    this.assertOk(response, payload);

    const validated = paginatedEnvelope(item).safeParse(payload);
    if (!validated.success) {
      throw ApiClientError.invalidResponse(
        "Paginated response did not match the expected shape",
      );
    }
    const envelope = validated.data as unknown as {
      data: z.infer<T>[];
      meta: { page: PageInfo };
    };
    return { items: envelope.data, page: envelope.meta.page };
  }

  /** Force a single-flight access-token rotation (e.g. on session bootstrap). */
  async refresh(): Promise<void> {
    await this.refreshAccessToken();
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = `${this.baseUrl}/${path.replace(/^\//, "")}`;
    if (!query) return url;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private async send<T extends z.ZodTypeAny>(
    path: string,
    options: RequestOptions<T>,
    isRetry: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    // A FormData body is sent as-is: the browser has to set its own multipart
    // Content-Type (it carries the boundary), and serializing it would destroy
    // the file. Everything else stays JSON.
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    if (options.body !== undefined && !isFormData) {
      headers["Content-Type"] = "application/json";
    }
    const token = this.session.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(path, options.query), {
        method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
        headers,
        body:
          options.body === undefined
            ? undefined
            : isFormData
              ? (options.body as FormData)
              : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (cause) {
      throw ApiClientError.network(
        cause instanceof Error ? cause.message : "Network request failed",
      );
    }

    if (options.skipRefresh) return response;

    // Transparent refresh: only once per request.
    if (response.status === 401 && !isRetry) {
      await this.refreshAccessToken();
      return this.send(path, options, true);
    }
    // The freshly-rotated token was itself rejected — end the session.
    if (response.status === 401 && isRetry) {
      await this.session.onAuthFailure();
    }
    return response;
  }

  private assertOk(response: Response, payload: unknown): void {
    if (response.ok) return;
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

  private async parse<T extends z.ZodTypeAny>(
    response: Response,
    schema?: T,
  ): Promise<Result<T>> {
    const payload: unknown = await response.json().catch(() => null);
    this.assertOk(response, payload);

    if (!schema) {
      const envelope = payload as { data?: unknown } | null;
      return (envelope?.data ?? null) as Result<T>;
    }
    const validated = successEnvelope(schema).safeParse(payload);
    if (!validated.success) {
      throw ApiClientError.invalidResponse(
        "Response did not match the expected shape",
      );
    }
    return (validated.data as unknown as { data: unknown }).data as Result<T>;
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
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
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

      const rotated = validated.data.data;
      await this.session.onTokensRotated(rotated);
      return rotated.accessToken;
    })().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }
}
