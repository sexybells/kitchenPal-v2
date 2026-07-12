import type { ExpenseItemInput } from "@kitchenpal/api-contract";

/** A priced expense line: the input plus its derived whole-đồng unit price. */
export interface PricedExpenseItem {
  name: string;
  normalizedName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Normalizes an item name into a stable key for price-history grouping. */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derives each line's `unitPrice` as `round(total / quantity)` in whole đồng.
 * Rounding keeps VND integer-only (no minor unit), so there is no floating drift;
 * quantity is guaranteed positive by the input contract, so no divide-by-zero.
 */
export function priceExpenseItems(
  items: ExpenseItemInput[],
): PricedExpenseItem[] {
  return items.map((item) => ({
    name: item.name,
    normalizedName: normalizeItemName(item.name),
    quantity: item.quantity,
    unitPrice: Math.round(item.total / item.quantity),
    total: item.total,
  }));
}
