import type { TFunction } from "i18next";
import type { StockState, TrackingMode } from "@kitchenpal/api-contract";
import type { BadgeTone } from "../../ui";

/**
 * Assistive stock level → Badge tone. The token mapping is the design contract:
 * plenty=success, some=info, low=warning, out=danger.
 */
export const STOCK_TONE: Record<StockState, BadgeTone> = {
  plenty: "success",
  some: "info",
  low: "warning",
  out: "danger",
};

/** Ordered strongest→weakest, used to render the stock-level selector. */
export const STOCK_STATES: readonly StockState[] = ["plenty", "some", "low", "out"];

/** The tracking modes offered in the item form. */
export const TRACKING_MODES: readonly TrackingMode[] = [
  "state_only",
  "household_unit",
  "exact",
];

/**
 * Canonical pantry categories offered in the form. Free-form categories from
 * the server are still shown verbatim as group headers; these are the presets.
 */
export const PANTRY_CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "grains",
  "frozen",
  "bakery",
  "beverages",
  "condiments",
  "other",
] as const;
export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

/** True (and narrows) when a category is one of the built-in presets. */
export const isPresetCategory = (category: string): category is PantryCategory =>
  (PANTRY_CATEGORIES as readonly string[]).includes(category);

/** Localize a category: preset keys get a translation, custom strings pass through. */
export const categoryLabel = (t: TFunction, category: string): string =>
  isPresetCategory(category) ? t(`pantry.category.${category}`) : category;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ExpiryLevel = "expired" | "soon" | "ok";

export interface ExpiryInfo {
  days: number;
  level: ExpiryLevel;
}

/**
 * Whole days from `now` until `expiryDate` (negative when already expired), plus
 * an urgency level: expired (≤0), soon (≤3 days), otherwise ok. Returns null
 * when the item has no tracked expiry.
 */
export const expiryInfo = (
  expiryDate: string | null,
  now: number = Date.now(),
): ExpiryInfo | null => {
  if (!expiryDate) return null;
  const parsed = Date.parse(expiryDate);
  if (Number.isNaN(parsed)) return null;
  const days = Math.ceil((parsed - now) / MS_PER_DAY);
  const level: ExpiryLevel = days <= 0 ? "expired" : days <= 3 ? "soon" : "ok";
  return { days, level };
};

/** Expiry level → Badge tone. */
export const EXPIRY_TONE: Record<ExpiryLevel, BadgeTone> = {
  expired: "danger",
  soon: "warning",
  ok: "neutral",
};

export interface PantryGroup<T> {
  category: string;
  items: T[];
}

/**
 * Group items by category, preserving each category's first-seen order (the
 * list already arrives sorted by the requested key within a category).
 */
export const groupByCategory = <T extends { category: string }>(
  items: T[],
): PantryGroup<T>[] => {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const bucket = buckets.get(item.category);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.category, [item]);
      order.push(item.category);
    }
  }
  return order.map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  }));
};

/**
 * RFC-4122 v4 UUID for consume/cook idempotency keys. Uses `Math.random`, which
 * is sufficient for a dedupe token (it need not be cryptographically strong).
 */
export const generateIdempotencyKey = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
