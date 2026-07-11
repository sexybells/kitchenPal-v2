import { z } from "zod";
import { dataScopeSchema } from "./scope.js";
import { objectIdSchema } from "./pantry.js";
import { mealTypeSchema } from "./recipes.js";

/** Day of the week, 0 = Monday … 6 = Sunday. */
export const dayOfWeekSchema = z.number().int().min(0).max(6);
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;

/**
 * One meal slot in a weekly plan. `id` is stable so edits target a specific
 * slot; `recipeId` is null when the slot is empty. Recipe summary fields are
 * populated for display and null when empty or the recipe is no longer readable.
 */
export const mealPlanSlotSchema = z.object({
  id: z.string(),
  dayOfWeek: dayOfWeekSchema,
  mealType: mealTypeSchema,
  recipeId: z.string().nullable(),
  recipeName: z.string().nullable(),
  recipeImageUrl: z.string().nullable(),
});
export type MealPlanSlot = z.infer<typeof mealPlanSlotSchema>;

export const mealPlanResponseSchema = z.object({
  id: z.string(),
  scope: dataScopeSchema,
  /** ISO date (start of the plan week). */
  weekStart: z.string(),
  slots: z.array(mealPlanSlotSchema),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;

/**
 * Create a weekly plan. Empty slots are generated for every day × meal type;
 * `mealTypes` defaults to the three main meals.
 */
export const createMealPlanSchema = z.object({
  weekStart: z.coerce.date(),
  mealTypes: z
    .array(mealTypeSchema)
    .min(1)
    .max(4)
    .default(["breakfast", "lunch", "dinner"]),
});
export type CreateMealPlanInput = z.infer<typeof createMealPlanSchema>;

/**
 * Assign (or clear, with `null`) the recipe in one slot. `expectedVersion`
 * guards against lost updates: a stale version is rejected with a conflict.
 */
export const updateSlotSchema = z.object({
  recipeId: objectIdSchema.nullable(),
  expectedVersion: z.number().int().min(0),
});
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>;

/**
 * Auto-fill the plan's empty slots from existing recipes, respecting dietary
 * preferences and available pantry. Only empty slots are filled unless
 * `overwrite` is set. Recipes are never fabricated.
 */
export const autoFillSchema = z.object({
  overwrite: z.boolean().default(false),
});
export type AutoFillInput = z.infer<typeof autoFillSchema>;

export const autoFillResponseSchema = z.object({
  plan: mealPlanResponseSchema,
  filledSlotIds: z.array(z.string()),
  /** AI provider that ranked candidates, or `none` when degraded to heuristics. */
  provider: z.string(),
  degraded: z.boolean(),
  /** True when no recipe matched the constraints; slots were left for manual entry. */
  needsManual: z.boolean(),
});
export type AutoFillResponse = z.infer<typeof autoFillResponseSchema>;
