import type { PantryMatchResult, PantryStockLike } from "./pantry-match";

/**
 * Days before expiry at which an item counts as "at risk". Must stay in step
 * with the mobile app's "soon" threshold: see `expiryInfo` in
 * `apps/mobile/src/features/pantry/stock.ts` (`days <= 3` = "soon").
 */
export const AT_RISK_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** An expiring pantry item a recipe would use up. */
export interface Rescue {
  pantryItemId: string;
  name: string;
  expiryDate: Date;
}

/**
 * At risk = still in stock and `now < expiryDate <= now + AT_RISK_DAYS`. Items
 * already at or past expiry are excluded: the app labels them "expired" and we
 * never suggest rescuing them.
 */
export function isAtRisk(item: PantryStockLike, now: Date): boolean {
  if (item.stockState === "out" || !item.expiryDate) {
    return false;
  }
  const expiry = item.expiryDate.getTime();
  const nowMs = now.getTime();
  return expiry > nowMs && expiry <= nowMs + AT_RISK_DAYS * DAY_MS;
}

/**
 * The at-risk pantry items a recipe's required (non-optional) ingredients use,
 * deduped by pantry item. Optional garnishes never count as a rescue.
 */
export function findRescues(
  match: PantryMatchResult,
  stock: PantryStockLike[],
  now: Date,
): Rescue[] {
  const byId = new Map(stock.map((item) => [item.id, item]));
  const rescues = new Map<string, Rescue>();
  for (const entry of match.available) {
    if (entry.ingredient.optional || !entry.pantryItemId) {
      continue;
    }
    const item = byId.get(entry.pantryItemId);
    if (item?.expiryDate && isAtRisk(item, now) && !rescues.has(item.id)) {
      rescues.set(item.id, {
        pantryItemId: item.id,
        name: item.name,
        expiryDate: item.expiryDate,
      });
    }
  }
  return [...rescues.values()];
}
