import type { StockState, TrackingMode } from "@kitchenpal/api-contract";

/** Stock levels ordered strongest to weakest. */
const STOCK_ORDER: StockState[] = ["plenty", "some", "low", "out"];

/**
 * Assistive thresholds used to derive a stock level from a numeric quantity when
 * an item is quantity-tracked. There is no per-item "full" capacity in the
 * assistive model, so these are deliberate, documented heuristics:
 *   qty <= 0            → out
 *   0 < qty <= 1        → low   (near-empty)
 *   1 < qty <= 3        → some
 *   qty > 3             → plenty
 * They exist so depletion deterministically flips the stock level as quantity
 * falls; users can always override the level explicitly.
 */
const LOW_AT = 1;
const SOME_AT = 3;

/** Derives an assistive stock level from a numeric quantity. */
export function deriveStockState(quantity: number): StockState {
  if (quantity <= 0) {
    return "out";
  }
  if (quantity <= LOW_AT) {
    return "low";
  }
  if (quantity <= SOME_AT) {
    return "some";
  }
  return "plenty";
}

/** Steps a stock level down by `steps` levels, clamped at `out`. */
export function stepStockStateDown(current: StockState, steps = 1): StockState {
  const index = STOCK_ORDER.indexOf(current);
  const next = Math.min(STOCK_ORDER.length - 1, index + Math.max(1, steps));
  return STOCK_ORDER[next] ?? "out";
}

/** True when a stock level should feed refill suggestions. */
export function needsRefill(state: StockState): boolean {
  return state === "low" || state === "out";
}

/**
 * A representative quantity for a stock level, used to keep a quantity-tracked
 * item's number consistent with its level when it is stepped down without an
 * explicit amount. Chosen as the top of each level's derivation band so that
 * {@link deriveStockState} of the result returns the same level.
 */
function nominalQuantityFor(state: StockState): number {
  switch (state) {
    case "out":
      return 0;
    case "low":
      return LOW_AT;
    case "some":
      return SOME_AT;
    case "plenty":
      return SOME_AT + 1;
  }
}

/** The outcome of depleting a single item. */
export interface Depletion {
  quantity: number;
  stockState: StockState;
}

/**
 * Computes the new quantity and stock level after consuming from an item.
 * Quantity-tracked items subtract `amount` (clamped at 0) and re-derive the
 * level from the remaining quantity; `state_only` items (or any consume without
 * an amount) step the assistive level down by `steps`.
 */
export function applyDepletion(
  current: { quantity: number; stockState: StockState; trackingMode: TrackingMode },
  input: { amount?: number; steps?: number },
): Depletion {
  const tracksQuantity =
    current.trackingMode === "exact" ||
    current.trackingMode === "household_unit";

  if (tracksQuantity && input.amount !== undefined) {
    const quantity = Math.max(0, round(current.quantity - input.amount));
    return { quantity, stockState: deriveStockState(quantity) };
  }

  const stockState = stepStockStateDown(current.stockState, input.steps ?? 1);
  // For a quantity-tracked item stepped down without an amount, bring the number
  // in line with the new level so a later amount-based consume does not re-derive
  // (and silently reverse) the step-down. State-only items carry no meaningful
  // quantity, so theirs is left untouched.
  return {
    quantity: tracksQuantity ? nominalQuantityFor(stockState) : current.quantity,
    stockState,
  };
}

/** Rounds to a sane precision so floating-point subtraction stays clean. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
