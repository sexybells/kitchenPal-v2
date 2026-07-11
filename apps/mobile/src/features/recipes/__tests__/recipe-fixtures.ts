import type {
  MealPlanResponse,
  MealPlanSlot,
  PantryMatchResponse,
  RecipeDraft,
  RecipeResponse,
} from "@kitchenpal/api-contract";

/** Build a recipe for tests, overriding only what a case cares about. */
export const makeRecipe = (
  overrides: Partial<RecipeResponse> = {},
): RecipeResponse => ({
  id: "r1",
  scope: "personal",
  name: "Phở bò",
  mealType: "dinner",
  tags: ["vietnamese"],
  cookTimeMinutes: 45,
  servings: 4,
  ingredients: [
    { name: "Bánh phở", quantity: 400, unit: "g", optional: false },
    { name: "Thịt bò", quantity: 300, unit: "g", optional: false },
  ],
  steps: ["Ninh xương", "Chần bánh phở", "Chan nước dùng"],
  sourceType: "manual",
  imageUrl: null,
  averageRating: 4.5,
  reviewCount: 12,
  viewCount: 100,
  published: false,
  isOwner: true,
  version: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

export const makePantryMatch = (
  overrides: Partial<PantryMatchResponse> = {},
): PantryMatchResponse => ({
  recipeId: "r1",
  totalIngredients: 2,
  availableCount: 1,
  neededCount: 1,
  matchScore: 0.5,
  available: [
    {
      name: "Bánh phở",
      quantity: 400,
      unit: "g",
      optional: false,
      pantryItemId: "p1",
    },
  ],
  needed: [
    {
      name: "Thịt bò",
      quantity: 300,
      unit: "g",
      optional: false,
      pantryItemId: null,
    },
  ],
  ...overrides,
});

export const makeDraft = (overrides: Partial<RecipeDraft> = {}): RecipeDraft => ({
  name: "Imported Dish",
  mealType: "lunch",
  tags: [],
  cookTimeMinutes: 20,
  servings: 2,
  ingredients: [{ name: "Rice", quantity: 1, unit: "cup", optional: false }],
  steps: ["Cook the rice"],
  imageUrl: null,
  sourceUrl: "https://example.com/recipe",
  ...overrides,
});

export const makeSlot = (overrides: Partial<MealPlanSlot> = {}): MealPlanSlot => ({
  id: "s1",
  dayOfWeek: 0,
  mealType: "breakfast",
  recipeId: null,
  recipeName: null,
  recipeImageUrl: null,
  ...overrides,
});

export const makeMealPlan = (
  overrides: Partial<MealPlanResponse> = {},
): MealPlanResponse => ({
  id: "plan1",
  scope: "personal",
  weekStart: "2026-07-06T00:00:00.000Z",
  slots: [makeSlot()],
  version: 3,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
  ...overrides,
});
