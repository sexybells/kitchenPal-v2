import type { ShoppingItem } from "@kitchenpal/api-contract";

/** A shopping list split into one section per category, plus a total count. */
export interface ShoppingGroup {
  /** Raw category key (null items fall under the shared "other" bucket key). */
  category: string;
  items: ShoppingItem[];
}

/** Category key used for items generated/added without a category. */
export const UNCATEGORIZED = "other";

/**
 * Group list items by category for the checklist, preserving first-seen order so
 * the sections stay stable as items are toggled. Unbought items sort above bought
 * ones within each section so the "still to buy" work stays at the top.
 */
export function groupByCategory(items: ShoppingItem[]): ShoppingGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, ShoppingItem[]>();

  for (const item of items) {
    const key = item.category ?? UNCATEGORIZED;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(item);
  }

  return order.map((category) => ({
    category,
    items: [...(buckets.get(category) ?? [])].sort(
      (a, b) => Number(a.bought) - Number(b.bought),
    ),
  }));
}

/** Progress summary for the checkout bar. */
export interface ListSummary {
  total: number;
  bought: number;
  remaining: number;
  /** True when every line is checked off (and there is at least one line). */
  complete: boolean;
}

export function summarize(items: ShoppingItem[]): ListSummary {
  const bought = items.filter((item) => item.bought).length;
  return {
    total: items.length,
    bought,
    remaining: items.length - bought,
    complete: items.length > 0 && bought === items.length,
  };
}
