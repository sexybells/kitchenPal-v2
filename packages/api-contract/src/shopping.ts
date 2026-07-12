import { z } from "zod";
import { dataScopeSchema } from "./scope.js";
import { objectIdSchema } from "./pantry.js";

/**
 * One line on a shopping list. `id` is stable so edits and toggles target a
 * specific item. `bought` flips as the shopper checks items off. `sourceRecipeId`
 * links a line back to the recipe that required it (null for manual or
 * refill-sourced items). `quantity`/`unit`/`category` are best-effort and may be
 * null when generated from a recipe that did not specify them.
 */
export const shoppingItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  category: z.string().nullable(),
  bought: z.boolean(),
  sourceRecipeId: z.string().nullable(),
});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;

/** Full shopping-list projection returned by the shopping endpoints. */
export const shoppingListResponseSchema = z.object({
  id: z.string(),
  scope: dataScopeSchema,
  /** The meal plan this list was generated from, or null for an ad-hoc list. */
  mealPlanId: z.string().nullable(),
  items: z.array(shoppingItemSchema),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShoppingListResponse = z.infer<typeof shoppingListResponseSchema>;

/**
 * Generate (or refresh) a shopping list from a meal plan. The server resolves
 * every planned recipe's ingredients, excludes what is already in the pantry,
 * dedupes across recipes, and merges the result into the plan's list. Re-running
 * is idempotent: already-present items are preserved (keeping their `bought`
 * state), never silently duplicated.
 */
export const generateShoppingSchema = z.object({
  mealPlanId: objectIdSchema,
});
export type GenerateShoppingInput = z.infer<typeof generateShoppingSchema>;

/** One needed item handed off from the pantry-refill or recipe add-missing seam. */
export const neededItemInputSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  unit: z.string().min(1).max(30).nullable().optional(),
  category: z.string().min(1).max(60).nullable().optional(),
  sourceRecipeId: objectIdSchema.nullable().optional(),
});
export type NeededItemInput = z.infer<typeof neededItemInputSchema>;

/**
 * Add ad-hoc needed items to the caller's current list (created if none exists).
 * This is the real endpoint the Phase 4 refill and Phase 5 add-missing flows
 * call. Items are merged by name + unit, so a repeated hand-off does not
 * duplicate lines.
 */
export const addNeededItemsSchema = z.object({
  items: z.array(neededItemInputSchema).min(1).max(200),
});
export type AddNeededItemsInput = z.infer<typeof addNeededItemsSchema>;

/**
 * Add a single item to a list. `expectedVersion` guards against lost updates on
 * a shared list: a stale version is rejected with a conflict.
 */
export const addShoppingItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  unit: z.string().min(1).max(30).nullable().optional(),
  category: z.string().min(1).max(60).nullable().optional(),
  sourceRecipeId: objectIdSchema.nullable().optional(),
  expectedVersion: z.number().int().min(0),
});
export type AddShoppingItemInput = z.infer<typeof addShoppingItemSchema>;

/**
 * Edit an item or toggle its `bought` flag. `expectedVersion` guards against lost
 * updates: two shoppers editing the same list race on the version, and the stale
 * writer gets a conflict rather than silently clobbering the other's change.
 */
export const updateShoppingItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  unit: z.string().min(1).max(30).nullable().optional(),
  category: z.string().min(1).max(60).nullable().optional(),
  bought: z.boolean().optional(),
  expectedVersion: z.number().int().min(0),
});
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;

/** Remove an item; `expectedVersion` guards the shared-list write. */
export const deleteShoppingItemSchema = z.object({
  expectedVersion: z.coerce.number().int().min(0),
});
export type DeleteShoppingItemInput = z.infer<typeof deleteShoppingItemSchema>;
