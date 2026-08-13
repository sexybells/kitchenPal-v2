import type { MealType } from "@kitchenpal/api-contract";

/** One ingredient line in a seed recipe. Mirrors `RecipeIngredientItem`. */
export interface SeedIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  optional?: boolean;
}

/**
 * A server-owned ("system") recipe the seeder guarantees exists. Ratings, view
 * counts and other derived fields are server-controlled and left at their schema
 * defaults; a seed only carries authored content (Vietnamese-first, full
 * ingredients + steps) so the recipe browser, AI suggestions and meal-plan
 * auto-fill have real, usable candidates on a fresh install.
 *
 * Two conventions matter for the suggestion pipeline:
 *
 * - **Ingredient names are plain pantry names** ("thịt bò", "cà chua"), not
 *   prose. `pantry-match` compares whole-word tokens, so a name that reads like
 *   a shopping-list entry is what actually scores against a user's pantry.
 * - **Dietary tags are duplicated in Vietnamese and English** ("chay" +
 *   "vegetarian"). `preference.diet` is a free-form string, and
 *   `satisfiesPreferences` requires an exact tag match, so carrying both spellings
 *   means either value a user stores still resolves to a non-empty pool.
 */
export interface SystemRecipeSeed {
  name: string;
  mealType: MealType;
  cookTimeMinutes: number;
  servings: number;
  tags: string[];
  ingredients: SeedIngredient[];
  steps: string[];
}
