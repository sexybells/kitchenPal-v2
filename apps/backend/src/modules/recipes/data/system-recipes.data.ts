import { BREAKFAST_RECIPES } from "./system-recipes-breakfast";
import { DINNER_RECIPES } from "./system-recipes-dinner";
import { LUNCH_RECIPES } from "./system-recipes-lunch";
import { SNACK_RECIPES } from "./system-recipes-snack";
import type { SystemRecipeSeed } from "./system-recipe";

export type { SeedIngredient, SystemRecipeSeed } from "./system-recipe";

/**
 * The full server-owned recipe library, split by meal type so each file stays
 * readable. Coverage is deliberate: every meal type holds enough distinct dishes
 * for meal-plan auto-fill to build a week without repeating, and a substantial
 * `chay`/`vegetarian` subset exists in each so a user with a vegetarian
 * preference never faces an empty candidate pool. `system-recipes.data.spec.ts`
 * enforces those invariants.
 */
export const SYSTEM_RECIPES: readonly SystemRecipeSeed[] = [
  ...BREAKFAST_RECIPES,
  ...LUNCH_RECIPES,
  ...DINNER_RECIPES,
  ...SNACK_RECIPES,
];
