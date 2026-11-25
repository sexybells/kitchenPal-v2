import { z } from "zod";
import { dataScopeSchema } from "./scope.js";
import { objectIdSchema } from "./pantry.js";
import { paginationQuerySchema } from "./pagination.js";

/** When in the day a recipe is intended to be eaten. */
export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealType = z.infer<typeof mealTypeSchema>;

/**
 * Where a recipe came from:
 * - `manual`: a person typed it in.
 * - `import`: scraped from a URL and confirmed.
 * - `ai`: produced by an AI suggestion the user saved.
 * - `system`: server-owned seed content (readable by everyone).
 */
export const recipeSourceTypeSchema = z.enum([
  "manual",
  "import",
  "ai",
  "system",
]);
export type RecipeSourceType = z.infer<typeof recipeSourceTypeSchema>;

/** One ingredient line in a recipe. `optional` marks nice-to-have extras. */
export const recipeIngredientSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  unit: z.string().min(1).max(30).nullable().optional(),
  optional: z.boolean().default(false),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/** Full recipe projection returned by the recipe endpoints. */
export const recipeResponseSchema = z.object({
  id: z.string(),
  scope: dataScopeSchema,
  name: z.string(),
  mealType: mealTypeSchema,
  tags: z.array(z.string()),
  cookTimeMinutes: z.number().nullable(),
  servings: z.number().nullable(),
  ingredients: z.array(recipeIngredientSchema),
  steps: z.array(z.string()),
  sourceType: recipeSourceTypeSchema,
  imageUrl: z.string().nullable(),
  averageRating: z.number(),
  reviewCount: z.number(),
  viewCount: z.number(),
  published: z.boolean(),
  /** True when the caller owns this recipe (may edit/delete/publish it). */
  isOwner: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;

/** Create a recipe. `sourceType`/rating/counts are server-controlled. */
export const createRecipeSchema = z.object({
  name: z.string().min(1).max(200),
  mealType: mealTypeSchema.default("dinner"),
  tags: z.array(z.string().min(1).max(40)).max(30).default([]),
  cookTimeMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  servings: z.number().int().min(1).max(1000).nullable().optional(),
  ingredients: z.array(recipeIngredientSchema).max(200).default([]),
  steps: z.array(z.string().min(1).max(4000)).max(200).default([]),
  imageUrl: z.string().url().max(2000).nullable().optional(),
});
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;

/** Partial update of an owned recipe. */
export const updateRecipeSchema = z
  .object({
    name: z.string().min(1).max(200),
    mealType: mealTypeSchema,
    tags: z.array(z.string().min(1).max(40)).max(30),
    cookTimeMinutes: z.number().int().min(0).max(100_000).nullable(),
    servings: z.number().int().min(1).max(1000).nullable(),
    ingredients: z.array(recipeIngredientSchema).max(200),
    steps: z.array(z.string().min(1).max(4000)).max(200),
    imageUrl: z.string().url().max(2000).nullable(),
  })
  .partial();
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

/** Publish (or unpublish) an owned recipe into the community feed. */
export const publishRecipeSchema = z.object({
  published: z.boolean().default(true),
});
export type PublishRecipeInput = z.infer<typeof publishRecipeSchema>;

/** List/filter query for the caller's own recipes. */
export const recipeQuerySchema = paginationQuerySchema.extend({
  mealType: mealTypeSchema.optional(),
  tag: z.string().min(1).max(40).optional(),
  search: z.string().min(1).max(200).optional(),
  sort: z.enum(["recent", "name", "rating"]).default("recent"),
});
export type RecipeQuery = z.infer<typeof recipeQuerySchema>;

/** Community feed query: published recipes across all users. */
export const communityQuerySchema = paginationQuerySchema.extend({
  mealType: mealTypeSchema.optional(),
  tag: z.string().min(1).max(40).optional(),
  search: z.string().min(1).max(200).optional(),
  sort: z.enum(["rating", "popular", "recent"]).default("rating"),
});
export type CommunityQuery = z.infer<typeof communityQuerySchema>;

/**
 * Per-user recipe preferences that steer AI suggestions and meal auto-fill.
 * `diet` is a single dietary style tag (e.g. `vegetarian`); `allergens` and
 * `disliked` exclude recipes; `cuisines` bias suggestions.
 */
export const recipePreferenceResponseSchema = z.object({
  diet: z.string().nullable(),
  allergens: z.array(z.string()),
  disliked: z.array(z.string()),
  cuisines: z.array(z.string()),
});
export type RecipePreferenceResponse = z.infer<
  typeof recipePreferenceResponseSchema
>;

export const updatePreferenceSchema = z
  .object({
    diet: z.string().min(1).max(40).nullable(),
    allergens: z.array(z.string().min(1).max(60)).max(50),
    disliked: z.array(z.string().min(1).max(60)).max(100),
    cuisines: z.array(z.string().min(1).max(60)).max(50),
  })
  .partial();
export type UpdatePreferenceInput = z.infer<typeof updatePreferenceSchema>;

/** Post a rating (1..5) and optional review text on a recipe. */
export const createCommentSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(2000).optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const recipeCommentResponseSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  /** Author's display name. Raw author user ids are not exposed to readers. */
  authorName: z.string(),
  rating: z.number(),
  text: z.string().nullable(),
  createdAt: z.string(),
});
export type RecipeCommentResponse = z.infer<
  typeof recipeCommentResponseSchema
>;

/** An at-risk pantry item a suggestion would use up. */
export const suggestionRescueSchema = z.object({
  name: z.string(),
  /** ISO date (or datetime) the item expires. */
  expiryDate: z.string(),
});
export type SuggestionRescue = z.infer<typeof suggestionRescueSchema>;

/** The user's local day, with its Vietnamese lunar date and vegetarian flags. */
export const suggestionDaySchema = z.object({
  /** Local solar date, `YYYY-MM-DD`. */
  date: z.string(),
  lunar: z.object({
    day: z.number(),
    month: z.number(),
    year: z.number(),
    isLeapMonth: z.boolean(),
  }),
  /** True on lunar day 1 or 15. */
  vegetarianDay: z.boolean(),
  /** True when the user observes vegetarian days and today is one. */
  vegetarianPriority: z.boolean(),
});
export type SuggestionDay = z.infer<typeof suggestionDaySchema>;

/**
 * One suggested recipe with its pantry-match signal. `recipeId` always points
 * at a real, readable recipe — suggestions never fabricate content.
 */
export const recipeSuggestionSchema = z.object({
  recipeId: z.string(),
  name: z.string(),
  mealType: mealTypeSchema,
  imageUrl: z.string().nullable(),
  reason: z.string(),
  matchScore: z.number(),
  availableCount: z.number(),
  neededCount: z.number(),
  /** Pantry items about to expire that this recipe would use up. */
  rescues: z.array(suggestionRescueSchema),
  isVegetarian: z.boolean(),
});
export type RecipeSuggestion = z.infer<typeof recipeSuggestionSchema>;

/** Query for AI suggestions (both the preferences- and pantry-based paths). */
export const suggestionQuerySchema = z.object({
  mealType: mealTypeSchema.optional(),
  limit: z.number().int().min(1).max(20).default(6),
});
export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

export const suggestionsResponseSchema = z.object({
  suggestions: z.array(recipeSuggestionSchema),
  /** AI provider that ranked the list, or `none` when degraded to heuristics. */
  provider: z.string(),
  /** True when no AI provider was available; results are heuristic, not AI. */
  degraded: z.boolean(),
  day: suggestionDaySchema,
});
export type SuggestionsResponse = z.infer<typeof suggestionsResponseSchema>;

/** External recipe web-search (Google Custom Search). */
export const externalSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(6),
});
export type ExternalSearchQuery = z.infer<typeof externalSearchQuerySchema>;

export const externalSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type ExternalSearchResult = z.infer<typeof externalSearchResultSchema>;

export const externalSearchResponseSchema = z.object({
  results: z.array(externalSearchResultSchema),
  provider: z.string(),
  /** True when no search key was configured; results are empty, not fabricated. */
  degraded: z.boolean(),
});
export type ExternalSearchResponse = z.infer<
  typeof externalSearchResponseSchema
>;

/**
 * A parsed-but-not-persisted recipe scraped from a URL. Import returns this for
 * review; the user confirms (possibly after edits) to create the recipe. Nothing
 * is created until confirm.
 */
export const recipeDraftSchema = z.object({
  name: z.string().min(1).max(200),
  mealType: mealTypeSchema.default("dinner"),
  tags: z.array(z.string().min(1).max(40)).max(30).default([]),
  cookTimeMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  servings: z.number().int().min(1).max(1000).nullable().optional(),
  ingredients: z.array(recipeIngredientSchema).max(200).default([]),
  steps: z.array(z.string().min(1).max(4000)).max(200).default([]),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
});
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

export const importFromUrlSchema = z.object({
  url: z.string().url().max(2000),
});
export type ImportFromUrlInput = z.infer<typeof importFromUrlSchema>;

export const importFromUrlResponseSchema = z.object({
  /** Parsed draft, or null when the page had no recognizable recipe. */
  draft: recipeDraftSchema.nullable(),
  /** True when scraping/parsing could not produce a usable draft. */
  degraded: z.boolean(),
  warnings: z.array(z.string()),
});
export type ImportFromUrlResponse = z.infer<
  typeof importFromUrlResponseSchema
>;

/** Confirm an import: create the recipe from the (reviewed) draft. */
export const confirmImportSchema = z.object({
  draft: recipeDraftSchema,
});
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;

/** One classified ingredient in a pantry-match result. */
export const pantryMatchIngredientSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  optional: z.boolean(),
  /** Pantry item that satisfies this ingredient, when one was matched. */
  pantryItemId: z.string().nullable(),
});
export type PantryMatchIngredient = z.infer<
  typeof pantryMatchIngredientSchema
>;

/**
 * Result of comparing a recipe's ingredients against the caller's pantry.
 * `needed` is the hand-off to the shopping module (a later phase): this endpoint
 * RETURNS the list; it never writes a shopping list itself.
 */
export const pantryMatchResponseSchema = z.object({
  recipeId: z.string(),
  totalIngredients: z.number(),
  availableCount: z.number(),
  neededCount: z.number(),
  /** Fraction of ingredients already on hand, 0..1. */
  matchScore: z.number(),
  available: z.array(pantryMatchIngredientSchema),
  needed: z.array(pantryMatchIngredientSchema),
});
export type PantryMatchResponse = z.infer<typeof pantryMatchResponseSchema>;

export const objectIdParamSchema = objectIdSchema;
