import type {
  ConfirmScanInput,
  PantryDetection,
} from "@kitchenpal/api-contract";
import type { ReviewRow } from "./ScanReviewRow";
import { generateIdempotencyKey } from "./stock";

/** Seed an editable review row from an AI detection. */
export const detectionToRow = (detection: PantryDetection): ReviewRow => {
  const hasQuantity = detection.quantity !== null;
  return {
    key: generateIdempotencyKey(),
    name: detection.name,
    category: detection.category ?? "other",
    quantity: detection.quantity ?? 1,
    hasQuantity,
    unit: detection.unit,
    stockState: detection.stockState,
    lowConfidence: detection.lowConfidence,
  };
};

/** A fresh, empty manual row (degrade path / "add missing"). */
export const emptyRow = (): ReviewRow => ({
  key: generateIdempotencyKey(),
  name: "",
  category: "other",
  quantity: 1,
  hasQuantity: false,
  unit: null,
  stockState: "plenty",
  lowConfidence: false,
});

/**
 * Build the confirm payload from the reviewed rows, dropping unnamed rows.
 * Quantity/unit are only sent for quantity-tracked rows; the rest carry the
 * assistive stock level. `trackingMode` follows whether a quantity is tracked.
 */
export const rowsToConfirmInput = (rows: ReviewRow[]): ConfirmScanInput => ({
  items: rows
    .filter((row) => row.name.trim().length > 0)
    .map((row) => ({
      name: row.name.trim(),
      category: row.category,
      stockState: row.stockState,
      trackingMode: row.hasQuantity ? ("exact" as const) : ("state_only" as const),
      quantity: row.hasQuantity ? row.quantity : undefined,
      unit: row.hasQuantity ? row.unit : undefined,
    })),
});
