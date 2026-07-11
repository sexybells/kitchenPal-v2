import { z } from "zod";
import {
  autoFillResponseSchema,
  externalSearchResponseSchema,
  importFromUrlResponseSchema,
  mealPlanResponseSchema,
  pantryMatchResponseSchema,
  recipeCommentResponseSchema,
  recipePreferenceResponseSchema,
  recipeResponseSchema,
  suggestionsResponseSchema,
  type AutoFillInput,
  type AutoFillResponse,
  type CommunityQuery,
  type ConfirmImportInput,
  type CreateCommentInput,
  type CreateMealPlanInput,
  type CreateRecipeInput,
  type ExternalSearchResponse,
  type ImportFromUrlInput,
  type ImportFromUrlResponse,
  type MealPlanResponse,
  type PantryMatchResponse,
  type PublishRecipeInput,
  type RecipeCommentResponse,
  type RecipePreferenceResponse,
  type RecipeQuery,
  type RecipeResponse,
  type SuggestionQuery,
  type SuggestionsResponse,
  type UpdatePreferenceInput,
  type UpdateRecipeInput,
  type UpdateSlotInput,
} from "@kitchenpal/api-contract";
import { api } from "./api";

/** List endpoints return `data: Recipe[]` inside the paginated envelope. */
const recipeListSchema = z.array(recipeResponseSchema);
/** Favorites/comments wrap their arrays in a named object. */
const favoritesSchema = z.object({ recipes: recipeListSchema });
const commentsSchema = z.object({
  comments: z.array(recipeCommentResponseSchema),
});
const favoriteToggleSchema = z.object({ favorite: z.boolean() });

/** Loose shape shared by the own-recipes and community list queries. */
interface RecipeListQuery {
  mealType?: string;
  tag?: string;
  search?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
}

/** Serialise a recipe list/community query into a `?a=b` string. */
const toRecipeQuery = (query: RecipeListQuery): string => {
  const params = new URLSearchParams();
  if (query.mealType) params.set("mealType", query.mealType);
  if (query.tag) params.set("tag", query.tag);
  if (query.search) params.set("search", query.search);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Recipe + meal-plan endpoint wrappers — each unwraps + validates the response
 * envelope, mirroring `pantryApi`. All routes are personal-scoped and require
 * the access token.
 */
export const recipesApi = {
  list: (query: Partial<RecipeQuery> = {}): Promise<RecipeResponse[]> =>
    api.request(`recipes${toRecipeQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: recipeListSchema,
    }),

  community: (query: Partial<CommunityQuery> = {}): Promise<RecipeResponse[]> =>
    api.request(`recipes/community${toRecipeQuery(query)}`, {
      method: "GET",
      auth: true,
      schema: recipeListSchema,
    }),

  favorites: (): Promise<RecipeResponse[]> =>
    api
      .request("recipes/favorites", {
        method: "GET",
        auth: true,
        schema: favoritesSchema,
      })
      .then((result) => result.recipes),

  getById: (id: string): Promise<RecipeResponse> =>
    api.request(`recipes/${id}`, {
      method: "GET",
      auth: true,
      schema: recipeResponseSchema,
    }),

  create: (input: CreateRecipeInput): Promise<RecipeResponse> =>
    api.request("recipes", {
      body: input,
      auth: true,
      schema: recipeResponseSchema,
    }),

  update: (id: string, input: UpdateRecipeInput): Promise<RecipeResponse> =>
    api.request(`recipes/${id}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: recipeResponseSchema,
    }),

  setPublished: (
    id: string,
    input: PublishRecipeInput,
  ): Promise<RecipeResponse> =>
    api.request(`recipes/${id}/publish`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: recipeResponseSchema,
    }),

  setFavorite: (id: string, favorite: boolean): Promise<boolean> =>
    api
      .request(`recipes/${id}/favorite`, {
        method: favorite ? "POST" : "DELETE",
        auth: true,
        schema: favoriteToggleSchema,
      })
      .then((result) => result.favorite),

  comments: (id: string): Promise<RecipeCommentResponse[]> =>
    api
      .request(`recipes/${id}/comments`, {
        method: "GET",
        auth: true,
        schema: commentsSchema,
      })
      .then((result) => result.comments),

  addComment: (
    id: string,
    input: CreateCommentInput,
  ): Promise<RecipeCommentResponse> =>
    api.request(`recipes/${id}/comments`, {
      body: input,
      auth: true,
      schema: recipeCommentResponseSchema,
    }),

  pantryMatch: (id: string): Promise<PantryMatchResponse> =>
    api.request(`recipes/${id}/pantry-match`, {
      body: {},
      auth: true,
      schema: pantryMatchResponseSchema,
    }),

  preferences: (): Promise<RecipePreferenceResponse> =>
    api.request("recipes/preferences", {
      method: "GET",
      auth: true,
      schema: recipePreferenceResponseSchema,
    }),

  updatePreferences: (
    input: UpdatePreferenceInput,
  ): Promise<RecipePreferenceResponse> =>
    api.request("recipes/preferences", {
      method: "PATCH",
      body: input,
      auth: true,
      schema: recipePreferenceResponseSchema,
    }),

  suggestFromPantry: (input: SuggestionQuery): Promise<SuggestionsResponse> =>
    api.request("recipes/ai-suggestions/pantry", {
      body: input,
      auth: true,
      schema: suggestionsResponseSchema,
    }),

  suggestFromPreferences: (
    input: SuggestionQuery,
  ): Promise<SuggestionsResponse> =>
    api.request("recipes/ai-suggestions/preferences", {
      body: input,
      auth: true,
      schema: suggestionsResponseSchema,
    }),

  externalSearch: (q: string, limit = 6): Promise<ExternalSearchResponse> =>
    api.request(
      `recipes/external-search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { method: "GET", auth: true, schema: externalSearchResponseSchema },
    ),

  importFromUrl: (input: ImportFromUrlInput): Promise<ImportFromUrlResponse> =>
    api.request("recipes/import-from-url", {
      body: input,
      auth: true,
      schema: importFromUrlResponseSchema,
    }),

  confirmImport: (input: ConfirmImportInput): Promise<RecipeResponse> =>
    api.request("recipes/imports/confirm", {
      body: input,
      auth: true,
      schema: recipeResponseSchema,
    }),
};

/** Weekly meal-plan endpoint wrappers. */
export const mealPlansApi = {
  current: (): Promise<MealPlanResponse> =>
    api.request("meal-plans/current", {
      method: "GET",
      auth: true,
      schema: mealPlanResponseSchema,
    }),

  create: (input: CreateMealPlanInput): Promise<MealPlanResponse> =>
    api.request("meal-plans", {
      // `weekStart` is a Date in the input type; serialise to ISO for transport.
      body: { ...input, weekStart: new Date(input.weekStart).toISOString() },
      auth: true,
      schema: mealPlanResponseSchema,
    }),

  updateSlot: (
    id: string,
    slotId: string,
    input: UpdateSlotInput,
  ): Promise<MealPlanResponse> =>
    api.request(`meal-plans/${id}/slots/${slotId}`, {
      method: "PATCH",
      body: input,
      auth: true,
      schema: mealPlanResponseSchema,
    }),

  autoFill: (id: string, input: AutoFillInput): Promise<AutoFillResponse> =>
    api.request(`meal-plans/${id}/auto-fill`, {
      body: input,
      auth: true,
      schema: autoFillResponseSchema,
    }),

  clear: (id: string): Promise<MealPlanResponse> =>
    api.request(`meal-plans/${id}/clear`, {
      body: {},
      auth: true,
      schema: mealPlanResponseSchema,
    }),
};
