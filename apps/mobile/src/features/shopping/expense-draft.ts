import type { ShoppingListResponse } from "@kitchenpal/api-contract";

/** One editable line in the Log Expense form. Prices are integer đồng strings. */
export interface ExpenseDraftItem {
  name: string;
  /** Quantity carried over from the shopping line (defaults to 1 when unknown). */
  quantity: number;
  /** Raw user-entered total in đồng; empty until the shopper fills the price. */
  total: string;
}

/** A checkout-prefilled expense draft: the bought lines, linked to their list. */
export interface ExpenseDraft {
  shoppingListId: string;
  items: ExpenseDraftItem[];
}

/**
 * Build a Log Expense draft from a shopping list's BOUGHT items — the checkout
 * hand-off. Prices are intentionally left blank: quantities and names carry over,
 * the shopper types what each line cost. An empty draft (nothing bought) still
 * links the list so the logged expense is attributed to it.
 */
export function buildExpenseDraftFromList(
  list: ShoppingListResponse,
): ExpenseDraft {
  return {
    shoppingListId: list.id,
    items: list.items
      .filter((item) => item.bought)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity != null && item.quantity > 0 ? item.quantity : 1,
        total: "",
      })),
  };
}
