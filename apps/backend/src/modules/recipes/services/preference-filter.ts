import type { RecipePreferenceResponse } from "@kitchenpal/api-contract";
import type { RecipePreference } from "../schemas/recipe-preference.schema";

/** A recipe reduced to the fields dietary filtering inspects. */
export interface DietFilterable {
  tags: string[];
  ingredients: { name: string }[];
}

/** Empty preference used when the caller has not set any. */
export const EMPTY_PREFERENCE: RecipePreferenceResponse = {
  diet: null,
  allergens: [],
  disliked: [],
  cuisines: [],
};

/** Projects a stored preference document (or null) into its API response. */
export function toPreferenceResponse(
  doc: RecipePreference | null,
): RecipePreferenceResponse {
  if (!doc) {
    return EMPTY_PREFERENCE;
  }
  return {
    diet: doc.diet ?? null,
    allergens: doc.allergens ?? [],
    disliked: doc.disliked ?? [],
    cuisines: doc.cuisines ?? [],
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Whether a recipe satisfies the user's dietary preferences:
 * - `diet` (e.g. `vegetarian`): the recipe must carry that tag.
 * - `allergens` / `disliked`: excluded if any ingredient name contains a term.
 *
 * Deterministic and side-effect free so AI ranking and the heuristic degrade
 * path share exactly one definition of "allowed".
 */
export function satisfiesPreferences(
  recipe: DietFilterable,
  pref: RecipePreferenceResponse,
): boolean {
  const tags = recipe.tags.map(normalize);
  if (pref.diet) {
    if (!tags.includes(normalize(pref.diet))) {
      return false;
    }
  }

  const blocked = [...pref.allergens, ...pref.disliked].map(normalize);
  if (blocked.length > 0) {
    const ingredientNames = recipe.ingredients.map((item) =>
      normalize(item.name),
    );
    const hasBlocked = ingredientNames.some((name) =>
      blocked.some((term) => term.length > 0 && name.includes(term)),
    );
    if (hasBlocked) {
      return false;
    }
  }

  return true;
}
