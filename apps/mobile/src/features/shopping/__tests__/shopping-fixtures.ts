import type {
  ShoppingItem,
  ShoppingListResponse,
} from "@kitchenpal/api-contract";

/** Build a shopping item with sensible defaults for tests. */
export const makeItem = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: over.id ?? "i1",
  name: over.name ?? "Trứng gà",
  quantity: over.quantity ?? null,
  unit: over.unit ?? null,
  category: over.category ?? null,
  bought: over.bought ?? false,
  sourceRecipeId: over.sourceRecipeId ?? null,
});

/** Build a shopping list with sensible defaults for tests. */
export const makeList = (
  over: Partial<ShoppingListResponse> = {},
): ShoppingListResponse => ({
  id: over.id ?? "list1",
  scope: over.scope ?? "personal",
  mealPlanId: over.mealPlanId ?? null,
  items: over.items ?? [makeItem()],
  version: over.version ?? 1,
  createdAt: over.createdAt ?? "2026-07-01T00:00:00.000Z",
  updatedAt: over.updatedAt ?? "2026-07-01T00:00:00.000Z",
});
