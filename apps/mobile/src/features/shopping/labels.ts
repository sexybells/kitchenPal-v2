import type { TFunction } from "i18next";
import { categoryLabel } from "../pantry/stock";
import { UNCATEGORIZED } from "./grouping";

/**
 * Localize a shopping-list section heading. Categories come from the recipe /
 * pantry match (the pantry category set), so we reuse the pantry category labeler
 * — preset keys get a translation, any custom string passes through unchanged.
 */
export function shoppingCategoryLabel(t: TFunction, category: string): string {
  return categoryLabel(t, category === UNCATEGORIZED ? "other" : category);
}
