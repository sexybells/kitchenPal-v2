import { Injectable } from "@nestjs/common";
import type { MealType, RecipePreferenceResponse } from "@kitchenpal/api-contract";
import type { HydratedDocument } from "mongoose";
import {
  toPersonalScope,
  type ScopeContext,
} from "../../../common/scope/scope-context";
import { PantryItemRepository } from "../../pantry/repositories/pantry-item.repository";
import { RecipeAiService, type RankResult } from "../ai/recipe-ai.service";
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
import { findRescues, type Rescue } from "./rescue";
import {
  satisfiesPreferences,
  toPreferenceResponse,
} from "./preference-filter";

type RecipeDoc = HydratedDocument<RecipeEntity>;

/** A candidate recipe paired with its pantry-match analysis. */
export interface RankedRecipe {
  doc: RecipeDoc;
  match: PantryMatchResult;
  /** Expiring pantry items this recipe's required ingredients would use up. */
  rescues: Rescue[];
  /** Whether the recipe carries the `chay` tag (case-insensitive). */
  isVegetarian: boolean;
}

/** Caller-computed facts about "now" that influence ranking. */
export interface SelectionContext {
  now: Date;
  /** Vegetarian priority applies (the caller has already ANDed in the opt-in). */
  vegetarianDay: boolean;
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
      context: SelectionContext;
      /** Defaults to true; false skips the AI ranker (heuristic order only). */
      useAi?: boolean;
    },
  ): Promise<SelectionResult> {
    // Dietary preferences are per-user (allergens are safety-critical), so they
    // are read in the caller's personal scope even when acting in a household.
    const preference = toPreferenceResponse(
      await this.preferences.findForOwner(toPersonalScope(options.userId)),
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
    const { context } = options;
    const analyzed: RankedRecipe[] = allowed.map((doc) => {
      const match = matchIngredients(doc.ingredients, stock, context.now);
      return {
        doc,
        match,
        rescues: findRescues(match, stock, context.now),
        isVegetarian: doc.tags.some((tag) => tag.toLowerCase() === "chay"),
      };
    });

    const rankResult: RankResult =
      options.useAi === false
        ? { order: null, provider: "none", degraded: true }
        : await this.ai.rank(
            options.operation,
            buildGoal(options.goal, context),
            analyzed.map(({ doc, match, rescues, isVegetarian }) => ({
              recipeId: doc.id,
              name: doc.name,
              mealType: doc.mealType,
              tags: doc.tags,
              matchScore: match.matchScore,
              rescueCount: rescues.length,
              isVegetarian,
            })),
            options.userId,
          );

    const ordered = rankResult.order
      ? orderBy(analyzed, rankResult.order, context)
      : heuristicOrder(analyzed, context);
    // A hard constraint after AI too; the partition is stable, so the AI's
    // order survives inside each group.
    const ranked = context.vegetarianDay ? vegetarianFirst(ordered) : ordered;

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
      expiryDate: item.expiryDate ?? null,
    }));
  }
}

/** Appends the expiry and vegetarian-day clauses to the caller's goal. */
function buildGoal(goal: string, context: SelectionContext): string {
  const clauses = ["prefer recipes that use up ingredients close to expiry"];
  if (context.vegetarianDay) {
    clauses.push("today is a vegetarian day, so prefer vegetarian dishes");
  }
  return goal + "; " + clauses.join("; ");
}

/** Stable partition: vegetarian recipes first, relative order preserved. */
function vegetarianFirst(entries: RankedRecipe[]): RankedRecipe[] {
  return [
    ...entries.filter((entry) => entry.isVegetarian),
    ...entries.filter((entry) => !entry.isVegetarian),
  ];
}

/** Reorders analyzed recipes to match an AI-provided id order; extras appended. */
function orderBy(
  analyzed: RankedRecipe[],
  order: string[],
  context: SelectionContext,
): RankedRecipe[] {
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
  return [...ordered, ...heuristicOrder([...byId.values()], context)];
}

/**
 * Deterministic order: vegetarian first (on a vegetarian day), then most
 * expiring items rescued, best pantry match, highest rating.
 */
function heuristicOrder(
  analyzed: RankedRecipe[],
  context: SelectionContext,
): RankedRecipe[] {
  return [...analyzed].sort((a, b) => {
    if (context.vegetarianDay && a.isVegetarian !== b.isVegetarian) {
      return a.isVegetarian ? -1 : 1;
    }
    if (b.rescues.length !== a.rescues.length) {
      return b.rescues.length - a.rescues.length;
    }
    if (b.match.matchScore !== a.match.matchScore) {
      return b.match.matchScore - a.match.matchScore;
    }
    return b.doc.averageRating - a.doc.averageRating;
  });
}
