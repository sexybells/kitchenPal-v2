import { Inject, Injectable } from "@nestjs/common";
import {
  recipeDraftSchema,
  type ImportFromUrlResponse,
  type RecipeDraft,
} from "@kitchenpal/api-contract";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { ExternalSearchLogRepository } from "../../logs/repositories/external-search-log.repository";
import { parseRecipeFromHtml } from "./recipe-jsonld-parser";
import {
  RECIPE_HTTP_CLIENT,
  type RecipeHttpClient,
} from "./recipe-http-client";

const OPERATION = "recipe.import.scrape";

/**
 * Scrapes a URL and parses a schema.org Recipe into a reviewable DRAFT. It never
 * creates a recipe — the caller must confirm the (possibly edited) draft in a
 * separate step. Fragile scraping is contained here: a failed fetch or unparsable
 * page degrades to a null draft with warnings, and every attempt is logged.
 */
@Injectable()
export class RecipeImportService {
  constructor(
    @Inject(RECIPE_HTTP_CLIENT) private readonly http: RecipeHttpClient,
    private readonly logs: ExternalSearchLogRepository,
    private readonly logger: AppLogger,
  ) {}

  async importFromUrl(
    url: string,
    userId: string,
  ): Promise<ImportFromUrlResponse> {
    const startedAt = Date.now();
    try {
      const { status, body } = await this.http.getText(url);
      if (status < 200 || status >= 300) {
        return this.degrade(
          url,
          userId,
          startedAt,
          [`Fetch failed with status ${status}`],
          false,
        );
      }

      const { draft: partial, warnings } = parseRecipeFromHtml(body, url);
      if (!partial) {
        return this.degrade(url, userId, startedAt, warnings, true);
      }

      const parsed = recipeDraftSchema.safeParse(partial);
      if (!parsed.success) {
        return this.degrade(
          url,
          userId,
          startedAt,
          [...warnings, "Parsed recipe failed validation"],
          true,
        );
      }

      await this.record(url, userId, startedAt, true, {
        parsed: true,
        ingredientCount: parsed.data.ingredients.length,
        stepCount: parsed.data.steps.length,
      });
      return { draft: parsed.data as RecipeDraft, degraded: false, warnings };
    } catch (error) {
      return this.degrade(
        url,
        userId,
        startedAt,
        [`Import error: ${errorMessage(error)}`],
        true,
      );
    }
  }

  private async degrade(
    url: string,
    userId: string,
    startedAt: number,
    warnings: string[],
    parsedAttempted: boolean,
  ): Promise<ImportFromUrlResponse> {
    this.logger.warn(
      `Recipe import from ${url} did not yield a draft`,
      RecipeImportService.name,
    );
    await this.record(url, userId, startedAt, false, {
      parsed: parsedAttempted,
      warnings,
    });
    return { draft: null, degraded: true, warnings };
  }

  private async record(
    url: string,
    userId: string,
    startedAt: number,
    success: boolean,
    response: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logs.create({
        provider: "url-scrape",
        operation: OPERATION,
        url,
        query: null,
        success,
        latencyMs: Date.now() - startedAt,
        response,
        userId: userId as unknown as never,
      });
    } catch (error) {
      this.logger.error(
        `Failed to write external-search log: ${errorMessage(error)}`,
        undefined,
        RecipeImportService.name,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
