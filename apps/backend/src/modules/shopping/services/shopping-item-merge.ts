import { randomUUID } from "node:crypto";

/** A needed item to be placed on a list (recipe- or refill-sourced). */
export interface NeededItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  sourceRecipeId: string | null;
}

/** A materialized shopping-list line. */
export interface MergeableItem extends NeededItem {
  id: string;
  bought: boolean;
}

/** Merge key: same name + unit is the same shopping line (case/space-insensitive). */
function mergeKey(name: string, unit: string | null): string {
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizedUnit = (unit ?? "").trim().toLowerCase();
  return `${normalizedName}::${normalizedUnit}`;
}

/**
 * Collapses needed items that share a name + unit into one line, summing
 * quantities when both are numeric (null quantity stays null). The first
 * occurrence's `sourceRecipeId`/`category` win. Used to dedupe across the
 * recipes of one meal plan so a shared ingredient appears once.
 */
export function dedupeNeededItems(items: NeededItem[]): NeededItem[] {
  const byKey = new Map<string, NeededItem>();
  for (const item of items) {
    const key = mergeKey(item.name, item.unit);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item });
      continue;
    }
    // Sum only when both sides carry a numeric quantity in the same unit;
    // otherwise leave the existing quantity untouched (can't add null + n).
    if (existing.quantity !== null && item.quantity !== null) {
      existing.quantity += item.quantity;
    }
    existing.category = existing.category ?? item.category;
    existing.sourceRecipeId = existing.sourceRecipeId ?? item.sourceRecipeId;
  }
  return [...byKey.values()];
}

/**
 * Merges freshly-needed items into an existing list of lines. An incoming item
 * whose name + unit already exists is skipped (the current line — including its
 * `bought` state — is preserved), so re-generating a plan's list or replaying a
 * refill hand-off is idempotent and never silently duplicates a line. Genuinely
 * new items are appended with a fresh id and `bought: false`.
 */
export function mergeNeededIntoItems(
  existing: MergeableItem[],
  needed: NeededItem[],
): MergeableItem[] {
  const present = new Set(existing.map((item) => mergeKey(item.name, item.unit)));
  const result = [...existing];
  for (const item of dedupeNeededItems(needed)) {
    const key = mergeKey(item.name, item.unit);
    if (present.has(key)) {
      continue;
    }
    present.add(key);
    result.push({
      id: randomUUID(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      bought: false,
      sourceRecipeId: item.sourceRecipeId,
    });
  }
  return result;
}
