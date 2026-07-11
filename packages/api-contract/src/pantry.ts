import { z } from "zod";
import { dataScopeSchema } from "./scope.js";
import { paginationQuerySchema } from "./pagination.js";

/** A 24-hex Mongo ObjectId. Rejects malformed ids at the edge (400, not 500). */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

/**
 * Assistive stock level. This is the primary, low-friction signal ("do I have
 * enough?") and the source of truth for `state_only` items. Ordered strongest to
 * weakest: `plenty > some > low > out`.
 */
export const stockStateSchema = z.enum(["plenty", "some", "low", "out"]);
export type StockState = z.infer<typeof stockStateSchema>;

/**
 * How precisely an item is tracked:
 * - `state_only`: assistive stock level only (no numeric quantity).
 * - `household_unit`: coarse whole-unit count (e.g. 2 cartons).
 * - `exact`: precise quantity + unit.
 */
export const trackingModeSchema = z.enum([
  "state_only",
  "household_unit",
  "exact",
]);
export type TrackingMode = z.infer<typeof trackingModeSchema>;

/**
 * Confidence in the current stock reading:
 * - `confirmed`: set by a person (manual entry/edit or an accepted scan).
 * - `estimated`: derived by AI or by depletion math, not user-verified.
 * - `low`: AI produced it with low confidence; flagged for manual review.
 */
export const confidenceStateSchema = z.enum(["confirmed", "estimated", "low"]);
export type ConfidenceState = z.infer<typeof confidenceStateSchema>;

/** Where an item came from. Server-controlled; never client-supplied. */
export const pantryItemSourceSchema = z.enum(["manual", "scan", "refill"]);
export type PantryItemSource = z.infer<typeof pantryItemSourceSchema>;

/** Lifecycle of a photo scan from upload to materialization. */
export const pantryScanStatusSchema = z.enum([
  "pending",
  "ready",
  "confirmed",
  "failed",
]);
export type PantryScanStatus = z.infer<typeof pantryScanStatusSchema>;

/** Full pantry item projection returned by the pantry endpoints. */
export const pantryItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  quantity: z.number(),
  unit: z.string().nullable(),
  stockState: stockStateSchema,
  trackingMode: trackingModeSchema,
  confidenceState: confidenceStateSchema,
  source: pantryItemSourceSchema,
  /** ISO timestamp, or null when the item has no tracked expiry. */
  expiryDate: z.string().nullable(),
  scope: dataScopeSchema,
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PantryItemResponse = z.infer<typeof pantryItemResponseSchema>;

/** Create a pantry item. `source`/`confidenceState` are server-controlled. */
export const createPantryItemSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  quantity: z.number().min(0).max(1_000_000).optional(),
  unit: z.string().min(1).max(20).nullable().optional(),
  stockState: stockStateSchema.default("plenty"),
  trackingMode: trackingModeSchema.default("state_only"),
  // Accepts an ISO string (coerced to a date); null clears any expiry.
  expiryDate: z.coerce.date().nullable().optional(),
});
export type CreatePantryItemInput = z.infer<typeof createPantryItemSchema>;

/** Partial update of a pantry item. All fields optional. */
export const updatePantryItemSchema = z
  .object({
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(60),
    quantity: z.number().min(0).max(1_000_000),
    unit: z.string().min(1).max(20).nullable(),
    stockState: stockStateSchema,
    trackingMode: trackingModeSchema,
    expiryDate: z.coerce.date().nullable(),
  })
  .partial();
export type UpdatePantryItemInput = z.infer<typeof updatePantryItemSchema>;

/** List/filter query for pantry items. Extends the shared pagination block. */
export const pantryItemQuerySchema = paginationQuerySchema.extend({
  category: z.string().min(1).max(60).optional(),
  stockState: stockStateSchema.optional(),
  search: z.string().min(1).max(120).optional(),
  /** Only items expiring within this many days from now. */
  expiringInDays: z.coerce.number().int().min(0).max(3650).optional(),
  sort: z.enum(["expiry", "name", "recent"]).default("expiry"),
});
export type PantryItemQuery = z.infer<typeof pantryItemQuerySchema>;

/**
 * Deplete listed pantry items after cooking. For quantity-tracked items pass
 * `quantity`; for `state_only` items omit it and the stock level steps down by
 * `steps` (default 1).
 */
export const consumePantrySchema = z.object({
  items: z
    .array(
      z.object({
        pantryItemId: objectIdSchema,
        quantity: z.number().positive().max(1_000_000).optional(),
        steps: z.number().int().positive().max(4).optional(),
      }),
    )
    .min(1)
    .max(100),
  /**
   * Optional client-supplied key. Repeats of the same key (e.g. a network
   * retry or double-tap) return the first result instead of depleting again.
   */
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type ConsumePantryInput = z.infer<typeof consumePantrySchema>;

/** Result of a consume operation. */
export const consumeResultSchema = z.object({
  updated: z.array(pantryItemResponseSchema),
  /** Subset of `updated` that is now `low` or `out`. */
  depleted: z.array(pantryItemResponseSchema),
});
export type ConsumeResult = z.infer<typeof consumeResultSchema>;

/**
 * One suggested refill. This is the hand-off contract to the shopping module
 * (a later phase): refill-suggestions RETURNS this list; it never writes a
 * shopping list itself.
 */
export const refillSuggestionSchema = z.object({
  pantryItemId: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string().nullable(),
  quantity: z.number(),
  stockState: stockStateSchema,
});
export type RefillSuggestion = z.infer<typeof refillSuggestionSchema>;

export const refillSuggestionsResponseSchema = z.object({
  suggestions: z.array(refillSuggestionSchema),
});
export type RefillSuggestionsResponse = z.infer<
  typeof refillSuggestionsResponseSchema
>;

/**
 * Cook-this-meal input: the ingredients a meal consumes. Recipes are a later
 * phase, so this is a self-contained consumption payload. Each ingredient is
 * resolved to a pantry item by `pantryItemId` when known, else by `name` within
 * the caller's scope.
 */
export const cookMealSchema = z.object({
  ingredients: z
    .array(
      z.object({
        pantryItemId: objectIdSchema.optional(),
        name: z.string().min(1).max(120),
        quantity: z.number().positive().max(1_000_000).optional(),
        unit: z.string().min(1).max(20).optional(),
      }),
    )
    .min(1)
    .max(100),
  /**
   * Optional client-supplied key. Repeats of the same key (e.g. a network
   * retry or double-tap) return the first result instead of depleting again.
   */
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type CookMealInput = z.infer<typeof cookMealSchema>;

/** Result of the cook-this-meal loop: what was depleted and what to refill. */
export const cookResultSchema = z.object({
  consumed: z.array(pantryItemResponseSchema),
  /** Ingredients with no matching pantry item (nothing to deplete). */
  unmatched: z.array(z.object({ name: z.string() })),
  refillSuggestions: z.array(refillSuggestionSchema),
});
export type CookResult = z.infer<typeof cookResultSchema>;

/** A single AI-detected item from a photo scan (editable before confirm). */
export const pantryDetectionSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  stockState: stockStateSchema,
  /** Model confidence 0..1. */
  confidence: z.number().min(0).max(1),
  confidenceState: confidenceStateSchema,
  /** True when the detection should be reviewed/entered manually. */
  lowConfidence: z.boolean(),
});
export type PantryDetection = z.infer<typeof pantryDetectionSchema>;

/** Full scan projection returned by the scan endpoints. */
export const pantryScanResponseSchema = z.object({
  id: z.string(),
  status: pantryScanStatusSchema,
  /** AI provider that produced the detections, or `none` when degraded. */
  provider: z.string(),
  imageUrl: z.string().nullable(),
  detections: z.array(pantryDetectionSchema),
  /**
   * True when no AI provider was available (no keys / provider error) and the
   * user must enter items manually. Impossible to mistake for real detections.
   */
  degraded: z.boolean(),
  materializedItemIds: z.array(z.string()),
  error: z.string().nullable(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PantryScanResponse = z.infer<typeof pantryScanResponseSchema>;

/**
 * Confirm a scan: materialize the accepted (and possibly edited) detections
 * into pantry items. Send the final list the user approved.
 */
export const confirmScanSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        category: z.string().min(1).max(60),
        quantity: z.number().min(0).max(1_000_000).optional(),
        unit: z.string().min(1).max(20).nullable().optional(),
        stockState: stockStateSchema.default("plenty"),
        trackingMode: trackingModeSchema.default("state_only"),
        expiryDate: z.coerce.date().nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type ConfirmScanInput = z.infer<typeof confirmScanSchema>;
