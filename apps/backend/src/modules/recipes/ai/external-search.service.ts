import { Inject, Injectable } from "@nestjs/common";
import type {
  ExternalSearchResponse,
  ExternalSearchResult,
} from "@kitchenpal/api-contract";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { APP_CONFIG, type AppConfig } from "../../../config/env.schema";
import { ExternalSearchLogRepository } from "../../logs/repositories/external-search-log.repository";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import type { Cache } from "cache-manager";
import {
  RECIPE_HTTP_CLIENT,
  type RecipeHttpClient,
} from "./recipe-http-client";

const OPERATION = "recipe.external-search";
/** Cache identical searches briefly to cut cost and latency on repeats. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

interface CseResponse {
  items?: {
    title?: string;
    link?: string;
    snippet?: string;
    pagemap?: { cse_image?: { src?: string }[] };
  }[];
}

/**
 * Recipe web-search via Google Custom Search. Degrades honestly when the API key
 * or search-engine id is not configured: returns an empty, flagged result rather
 * than fabricating links or crashing. Results are cached by query and every call
 * is logged for cost tracking.
 */
@Injectable()
export class ExternalSearchService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RECIPE_HTTP_CLIENT) private readonly http: RecipeHttpClient,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly logs: ExternalSearchLogRepository,
    private readonly logger: AppLogger,
  ) {}

  async search(
    query: string,
    limit: number,
    userId: string,
  ): Promise<ExternalSearchResponse> {
    if (!this.config.GOOGLE_SEARCH_API_KEY || !this.config.GOOGLE_SEARCH_CX) {
      this.logger.warn(
        "External recipe search requested with no Google Custom Search key; degrading to empty results",
        ExternalSearchService.name,
      );
      await this.record(query, userId, 0, false, { degraded: true });
      return { results: [], provider: "none", degraded: true };
    }

    const cacheKey = `recipe:search:${limit}:${query.toLowerCase()}`;
    const cached = await this.cache.get<ExternalSearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const startedAt = Date.now();
    try {
      const url =
        `${CSE_ENDPOINT}?key=${encodeURIComponent(this.config.GOOGLE_SEARCH_API_KEY)}` +
        `&cx=${encodeURIComponent(this.config.GOOGLE_SEARCH_CX)}` +
        `&num=${limit}&q=${encodeURIComponent(query)}`;
      const { status, body } = await this.http.getText(url);
      if (status < 200 || status >= 300) {
        throw new Error(`Search failed with status ${status}`);
      }
      const results = parseCseResults(body, limit);
      const response: ExternalSearchResponse = {
        results,
        provider: "google-cse",
        degraded: false,
      };
      await this.cache.set(cacheKey, response, CACHE_TTL_MS);
      await this.record(query, userId, startedAt, true, {
        resultCount: results.length,
      });
      return response;
    } catch (error) {
      this.logger.warn(
        `External recipe search failed: ${errorMessage(error)}`,
        ExternalSearchService.name,
      );
      await this.record(query, userId, startedAt, false, {
        error: errorMessage(error),
      });
      return { results: [], provider: "google-cse", degraded: true };
    }
  }

  private async record(
    query: string,
    userId: string,
    startedAt: number,
    success: boolean,
    response: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logs.create({
        provider: "google-cse",
        operation: OPERATION,
        query,
        url: null,
        success,
        latencyMs: startedAt ? Date.now() - startedAt : undefined,
        response,
        userId: userId as unknown as never,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write external-search log: ${errorMessage(error)}`,
        undefined,
        ExternalSearchService.name,
      );
    }
  }
}

function parseCseResults(body: string, limit: number): ExternalSearchResult[] {
  let parsed: CseResponse;
  try {
    parsed = JSON.parse(body) as CseResponse;
  } catch {
    return [];
  }
  return (parsed.items ?? []).slice(0, limit).map((item) => ({
    title: item.title ?? "",
    url: item.link ?? "",
    snippet: item.snippet ?? null,
    imageUrl: item.pagemap?.cse_image?.[0]?.src ?? null,
  }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
