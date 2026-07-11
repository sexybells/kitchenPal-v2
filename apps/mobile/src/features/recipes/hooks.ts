import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AutoFillInput,
  CommunityQuery,
  ConfirmImportInput,
  CreateCommentInput,
  CreateMealPlanInput,
  ImportFromUrlInput,
  PublishRecipeInput,
  RecipeQuery,
  RecipeResponse,
  UpdateSlotInput,
} from "@kitchenpal/api-contract";
import { mealPlansApi, recipesApi } from "../../api/recipes";

/** Recipe/meal-plan query keys — centralised so mutations invalidate cleanly. */
export const recipeKeys = {
  all: ["recipes"] as const,
  list: (query?: Partial<RecipeQuery>) =>
    ["recipes", "list", query ?? {}] as const,
  community: (query?: Partial<CommunityQuery>) =>
    ["recipes", "community", query ?? {}] as const,
  favorites: ["recipes", "favorites"] as const,
  detail: (id: string) => ["recipes", "detail", id] as const,
  comments: (id: string) => ["recipes", "comments", id] as const,
  pantryMatch: (id: string) => ["recipes", "pantry-match", id] as const,
};

export const mealPlanKeys = {
  all: ["meal-plans"] as const,
  current: ["meal-plans", "current"] as const,
};

const invalidateRecipes = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: recipeKeys.all });

/** Which recipe collection a list view is showing. */
export type RecipeCollection = "mine" | "community" | "favorites";

/** List recipes for a collection: own, community feed, or favorites. */
export const useRecipeList = (
  collection: RecipeCollection,
  query: Partial<RecipeQuery & CommunityQuery> = {},
) =>
  useQuery({
    queryKey:
      collection === "community"
        ? recipeKeys.community(query)
        : collection === "favorites"
          ? recipeKeys.favorites
          : recipeKeys.list(query),
    queryFn: () => {
      if (collection === "community") return recipesApi.community(query);
      if (collection === "favorites") return recipesApi.favorites();
      return recipesApi.list(query);
    },
  });

export const useRecipe = (id: string | null) =>
  useQuery({
    queryKey: recipeKeys.detail(id ?? "none"),
    queryFn: () => recipesApi.getById(id as string),
    enabled: id !== null,
  });

export const useRecipeComments = (id: string | null) =>
  useQuery({
    queryKey: recipeKeys.comments(id ?? "none"),
    queryFn: () => recipesApi.comments(id as string),
    enabled: id !== null,
  });

export const usePantryMatch = (id: string | null) =>
  useQuery({
    queryKey: recipeKeys.pantryMatch(id ?? "none"),
    queryFn: () => recipesApi.pantryMatch(id as string),
    enabled: id !== null,
  });

/**
 * Toggle a recipe's favorite flag with an optimistic heart: flip the cached
 * `isFavorite`-like state everywhere the recipe appears, rolling back on error.
 * Favorites membership is derived server-side, so the favorites list is
 * invalidated on settle.
 */
export const useToggleFavorite = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      recipesApi.setFavorite(id, favorite),
    onMutate: async ({ id, favorite }) => {
      await client.cancelQueries({ queryKey: recipeKeys.favorites });
      // Snapshot every cached favorites list so the toggle can roll back.
      const previous = client.getQueriesData<RecipeResponse[]>({
        queryKey: recipeKeys.favorites,
      });
      // Drop the recipe from any cached favorites list immediately on unfavorite.
      for (const [key, recipes] of previous) {
        if (!recipes) continue;
        client.setQueryData(
          key,
          favorite ? recipes : recipes.filter((recipe) => recipe.id !== id),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        client.setQueryData(key, data);
      }
    },
    onSettled: () => invalidateRecipes(client),
  });
};

export const useAddComment = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCommentInput }) =>
      recipesApi.addComment(id, input),
    onSuccess: (_data, { id }) => {
      void client.invalidateQueries({ queryKey: recipeKeys.comments(id) });
      void client.invalidateQueries({ queryKey: recipeKeys.detail(id) });
    },
  });
};

export const usePublishRecipe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PublishRecipeInput }) =>
      recipesApi.setPublished(id, input),
    onSuccess: (_data, { id }) => {
      void client.invalidateQueries({ queryKey: recipeKeys.detail(id) });
      void invalidateRecipes(client);
    },
  });
};

export const useImportFromUrl = () =>
  useMutation({
    mutationFn: (input: ImportFromUrlInput) => recipesApi.importFromUrl(input),
  });

export const useConfirmImport = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmImportInput) => recipesApi.confirmImport(input),
    onSuccess: () => invalidateRecipes(client),
  });
};

export const useCreateRecipe = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: recipesApi.create,
    onSuccess: () => invalidateRecipes(client),
  });
};

/** The current week's plan; a 404 (no plan yet) surfaces as an error state. */
export const useCurrentMealPlan = () =>
  useQuery({
    queryKey: mealPlanKeys.current,
    queryFn: () => mealPlansApi.current(),
    retry: false,
  });

export const useCreateMealPlan = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealPlanInput) => mealPlansApi.create(input),
    onSuccess: (plan) => {
      client.setQueryData(mealPlanKeys.current, plan);
      void client.invalidateQueries({ queryKey: mealPlanKeys.all });
    },
  });
};

export const useUpdateSlot = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      slotId,
      input,
    }: {
      id: string;
      slotId: string;
      input: UpdateSlotInput;
    }) => mealPlansApi.updateSlot(id, slotId, input),
    onSuccess: (plan) => client.setQueryData(mealPlanKeys.current, plan),
  });
};

export const useAutoFill = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AutoFillInput }) =>
      mealPlansApi.autoFill(id, input),
    onSuccess: (result) =>
      client.setQueryData(mealPlanKeys.current, result.plan),
  });
};
