import { Inject, Injectable } from "@nestjs/common";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { AiLogRepository } from "../../logs/repositories/ai-log.repository";
import {
  RECIPE_AI_PROVIDERS,
  type RecipeAiProvider,
} from "./recipe-ai-provider";

/** A candidate recipe presented to the AI ranker. */
export interface RankCandidate {
  recipeId: string;
  name: string;
  mealType: string;
  tags: string[];
  /** Fraction of ingredients already in the caller's pantry, 0..1. */
  matchScore: number;
}

/** Outcome of an AI ranking, including the honest degrade signal. */
export interface RankResult {
  /**
   * Ordered candidate ids (best first), or null when no provider produced a
   * usable ranking. On null the caller applies its own deterministic heuristic —
   * recipes are chosen from the SAME candidate set, never fabricated.
   */
  order: string[] | null;
  provider: string;
  degraded: boolean;
}

/**
 * Orchestrates recipe ranking for suggestions and meal auto-fill across the
 * configured text providers (OpenAI primary, Gemini fallback), degrading safely
 * when none succeed. Every attempt is written to AiLog. The AI only REORDERS a
 * caller-supplied candidate set — it can never introduce a recipe that does not
 * already exist and that the caller cannot read.
 */
@Injectable()
export class RecipeAiService {
  constructor(
    @Inject(RECIPE_AI_PROVIDERS) private readonly providers: RecipeAiProvider[],
    private readonly aiLogs: AiLogRepository,
    private readonly logger: AppLogger,
  ) {}

  async rank(
    operation: string,
    goal: string,
    candidates: RankCandidate[],
    userId: string,
  ): Promise<RankResult> {
    if (candidates.length === 0 || this.providers.length === 0) {
      if (this.providers.length === 0) {
        this.logger.warn(
          "Recipe AI requested with no provider configured; degrading to heuristic ranking",
          RecipeAiService.name,
        );
      }
      return { order: null, provider: "none", degraded: true };
    }

    const prompt = buildRankPrompt(goal, candidates);
    const candidateIds = new Set(candidates.map((c) => c.recipeId));

    for (const provider of this.providers) {
      const order = await this.tryProvider(
        provider,
        operation,
        prompt,
        candidateIds,
        userId,
      );
      if (order) {
        return { order, provider: provider.name, degraded: false };
      }
    }

    return { order: null, provider: "none", degraded: true };
  }

  private async tryProvider(
    provider: RecipeAiProvider,
    operation: string,
    prompt: string,
    candidateIds: Set<string>,
    userId: string,
  ): Promise<string[] | null> {
    const startedAt = Date.now();
    try {
      const { text, usage } = await provider.complete(prompt);
      const order = parseOrder(text, candidateIds);
      await this.recordLog(provider.name, operation, userId, {
        success: true,
        latencyMs: Date.now() - startedAt,
        response: { rankedCount: order.length, usage },
      });
      return order.length > 0 ? order : null;
    } catch (error) {
      await this.recordLog(provider.name, operation, userId, {
        success: false,
        latencyMs: Date.now() - startedAt,
        response: { error: errorMessage(error) },
      });
      this.logger.warn(
        `Recipe AI provider ${provider.name} failed: ${errorMessage(error)}`,
        RecipeAiService.name,
      );
      return null;
    }
  }

  private async recordLog(
    provider: string,
    operation: string,
    userId: string,
    fields: {
      success: boolean;
      latencyMs?: number;
      response?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.aiLogs.create({
        provider,
        operation,
        success: fields.success,
        latencyMs: fields.latencyMs,
        response: fields.response,
        userId: userId as unknown as never,
      });
    } catch (error) {
      // Audit logging must never break the request path.
      this.logger.error(
        `Failed to write AI log entry: ${errorMessage(error)}`,
        undefined,
        RecipeAiService.name,
      );
    }
  }
}

/** Builds the ranking prompt from the goal and candidate metadata. */
function buildRankPrompt(goal: string, candidates: RankCandidate[]): string {
  const rows = candidates.map((c) => ({
    id: c.recipeId,
    name: c.name,
    mealType: c.mealType,
    tags: c.tags,
    pantryMatch: Math.round(c.matchScore * 100) / 100,
  }));
  return (
    "You are a meal-planning assistant. Rank the candidate recipes from best to " +
    `worst for this goal: "${goal}". Prefer higher pantryMatch and relevance. ` +
    "Respond with ONLY a JSON object " +
    '{"order":[recipeId, ...]} listing the candidate ids best-first. Use only ' +
    "ids from the candidates; do not invent ids.\n" +
    `Candidates: ${JSON.stringify(rows)}`
  );
}

/**
 * Parses the model's ranking into a validated id list: extracts the JSON object,
 * keeps only ids that are in the candidate set, and drops duplicates. Tolerant of
 * prose/code-fence wrapping.
 */
function parseOrder(raw: string, candidateIds: Set<string>): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const order = (parsed as { order?: unknown }).order;
  if (!Array.isArray(order)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of order) {
    if (typeof value === "string" && candidateIds.has(value) && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
