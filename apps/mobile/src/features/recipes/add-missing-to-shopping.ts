import type { PantryMatchIngredient } from "@kitchenpal/api-contract";

/**
 * Hand-off seam for "add missing ingredients to the shopping list".
 *
 * The Shopping module ships in a later phase, so there is no shopping-list write
 * endpoint yet. This is a deliberate STUB: it does NOT persist anything and must
 * not pretend to. When Shopping lands, replace the body with a call to the
 * shopping-list API (e.g. `shoppingApi.addItems(...)`) — the input shape below is
 * the `needed` list from `POST /recipes/:id/pantry-match`, which the backend
 * documents as the shopping hand-off.
 *
 * Returns the count so the caller can confirm intent without implying a write.
 */
export interface AddMissingResult {
  /** How many ingredients would be sent to the shopping list. */
  count: number;
  /** Always false until the Shopping module is wired in. */
  persisted: boolean;
}

export const addMissingToShopping = (
  needed: PantryMatchIngredient[],
): AddMissingResult => ({
  count: needed.length,
  persisted: false,
});
