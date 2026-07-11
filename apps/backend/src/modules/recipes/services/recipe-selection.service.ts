import { Injectable } from "@nestjs/common";
import type { MealType, RecipePreferenceResponse } from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { PantryItemRepository } from "../../pantry/repositories/pantry-item.repository";
import { RecipeAiService } from "../ai/recipe-ai.service";
import {
  RecipeRepository,
  type RecipeEntity,
} from "../repositories/recipe.repository";
import { RecipePreferenceRepository } from "../repositories/recipe-preference.repository";
import {
  matchIngredients,
  type PantryMatchResult,
  type PantryStockLike,
} from "./pantry-match";
import {
  satisfiesPreferences,
  toPreferenceResponse,
} from "./preference-filter";

type RecipeDoc = HydratedDocument<RecipeEntity>;

/** A candidate recipe paired with its pantry-match analysis. */
export interface RankedRecipe {
  doc: RecipeDoc;
  match: PantryMatchResult;
}

/** Result of selecting and ranking candidate recipes. */
export interface SelectionResult {
  ranked: RankedRecipe[];
  preference: RecipePreferenceResponse;
  provider: string;
  degraded: boolean;
}

/**
 * Shared recipe selection used by AI suggestions and meal auto-fill. It gathers
 * readable candidate recipes, drops any that violate dietary preferences,
 * computes each one's pantry match, and ranks them — via the AI ranker when a
 * provider is configured, otherwise a deterministic heuristic (pantry match then
 * rating). Selection is always from EXISTING recipes: nothing is fabricated.
 */
@Injectable()
export class RecipeSelectionService {
  constructor(
    private readonly recipes: RecipeRepository,
    private readonly preferences: RecipePreferenceRepository,
    private readonly pantry: PantryItemRepository,
    private readonly ai: RecipeAiService,
  ) {}

  async select(
    scope: ScopeContext,
    options: {
      mealType?: MealType;
      operation: string;
      goal: string;
      userId: string;
    },
  ): Promise<SelectionResult> {
    const preference = toPreferenceResponse(
      await this.preferences.findForOwner(scope),
    );

    const candidates = await this.recipes.findCandidates(scope, {
      mealType: options.mealType,
    });
    const allowed = candidates.filter((doc) =>
      satisfiesPreferences(
        { tags: doc.tags, ingredients: doc.ingredients },
        preference,
      ),
    );

    const stock = await this.pantryStock(scope);
    const analyzed: RankedRecipe[] = allowed.map((doc) => ({
      doc,
      match: matchIngredients(doc.ingredients, stock),
    }));

    const rankResult = await this.ai.rank(
      options.operation,
      options.goal,
      analyzed.map(({ doc, match }) => ({
        recipeId: doc.id,
        name: doc.name,
        mealType: doc.mealType,
        tags: doc.tags,
        matchScore: match.matchScore,
      })),
      options.userId,
    );

    const ranked = rankResult.order
      ? orderBy(analyzed, rankResult.order)
      : heuristicOrder(analyzed);

    return {
      ranked,
      preference,
      provider: rankResult.provider,
      degraded: rankResult.degraded,
    };
  }

  private async pantryStock(scope: ScopeContext): Promise<PantryStockLike[]> {
    const items = await this.pantry.find(scope);
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      stockState: item.stockState,
    }));
  }
}

/** Reorders analyzed recipes to match an AI-provided id order; extras appended. */
function orderBy(analyzed: RankedRecipe[], order: string[]): RankedRecipe[] {
  const byId = new Map(analyzed.map((entry) => [entry.doc.id, entry]));
  const ordered: RankedRecipe[] = [];
  for (const id of order) {
    const entry = byId.get(id);
    if (entry) {
      ordered.push(entry);
      byId.delete(id);
    }
  }
  // Any candidate the model omitted still follows, heuristically ordered.
  return [...ordered, ...heuristicOrder([...byId.values()])];
}

/** Deterministic fallback: best pantry match first, then highest rating. */
function heuristicOrder(analyzed: RankedRecipe[]): RankedRecipe[] {
  return [...analyzed].sort((a, b) => {
    if (b.match.matchScore !== a.match.matchScore) {
      return b.match.matchScore - a.match.matchScore;
    }
    return b.doc.averageRating - a.doc.averageRating;
  });
}
