import type {
  NeededItemInput,
  PantryMatchIngredient,
  RefillSuggestion,
} from "@kitchenpal/api-contract";

/**
 * Needed-items hand-off mappers. These turn the two "add to shopping" sources —
 * a recipe's missing ingredients and the pantry's running-low refill suggestions
 * — into the `POST /shopping/needed-items` payload. The network write itself runs
 * through `useAddNeededItems`; keeping the mapping pure here makes it testable and
 * lets both seams share one shape.
 */

/**
 * Map a recipe pantry-match `needed[]` list to needed items, tagging each line
 * with the recipe it came from so the shopping list can show "từ công thức".
 */
export const neededItemsFromMatch = (
  needed: PantryMatchIngredient[],
  sourceRecipeId?: string | null,
): NeededItemInput[] =>
  needed.map((item) => ({
    name: item.name,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    sourceRecipeId: sourceRecipeId ?? null,
  }));

/**
 * Map pantry refill suggestions (running-low restocks) to needed items. These
 * carry no recipe, but keep their category so the list groups them sensibly.
 */
export const neededItemsFromRefill = (
  suggestions: RefillSuggestion[],
): NeededItemInput[] =>
  suggestions.map((suggestion) => ({
    name: suggestion.name,
    quantity: suggestion.quantity > 0 ? suggestion.quantity : null,
    unit: suggestion.unit,
    category: suggestion.category,
  }));
