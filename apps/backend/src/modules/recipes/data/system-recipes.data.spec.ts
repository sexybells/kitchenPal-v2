import type { MealType } from "@kitchenpal/api-contract";
import { SYSTEM_RECIPES } from "./system-recipes.data";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** A week of meal-plan slots needs this many distinct dishes per meal type. */
const MIN_PER_MEAL_TYPE = 7;

/** Vegetarian pool per meal type — enough that auto-fill has real choice. */
const MIN_VEGETARIAN_PER_MEAL_TYPE = 2;

function withMealType(mealType: MealType) {
  return SYSTEM_RECIPES.filter((recipe) => recipe.mealType === mealType);
}

function isVegetarian(tags: string[]): boolean {
  return tags.includes("chay");
}

describe("SYSTEM_RECIPES coverage", () => {
  it.each(MEAL_TYPES)(
    "offers at least a week of distinct %s dishes",
    (mealType) => {
      expect(withMealType(mealType).length).toBeGreaterThanOrEqual(
        MIN_PER_MEAL_TYPE,
      );
    },
  );

  it.each(MEAL_TYPES)("offers vegetarian %s options", (mealType) => {
    const vegetarian = withMealType(mealType).filter((recipe) =>
      isVegetarian(recipe.tags),
    );
    expect(vegetarian.length).toBeGreaterThanOrEqual(
      MIN_VEGETARIAN_PER_MEAL_TYPE,
    );
  });

  it("has no duplicate dish names", () => {
    // The seeder keys on the normalized name, so a duplicate would silently
    // collapse two seeds into one recipe.
    const names = SYSTEM_RECIPES.map((recipe) => recipe.name.trim().toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("SYSTEM_RECIPES content", () => {
  it("gives every recipe usable ingredients and steps", () => {
    for (const recipe of SYSTEM_RECIPES) {
      expect(recipe.name.trim()).not.toBe("");
      expect(recipe.ingredients.length).toBeGreaterThanOrEqual(3);
      expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
      expect(recipe.cookTimeMinutes).toBeGreaterThan(0);
      expect(recipe.servings).toBeGreaterThan(0);
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.name.trim()).not.toBe("");
      }
    }
  });

  it("keeps at least one required ingredient per recipe", () => {
    // matchIngredients scores over REQUIRED ingredients; an all-optional recipe
    // would score a perfect 1 against an empty pantry and top every ranking.
    for (const recipe of SYSTEM_RECIPES) {
      const required = recipe.ingredients.filter(
        (ingredient) => ingredient.optional !== true,
      );
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("tags vegetarian dishes in both Vietnamese and English", () => {
    // `preference.diet` is free-form, so both spellings must resolve.
    for (const recipe of SYSTEM_RECIPES) {
      if (isVegetarian(recipe.tags)) {
        expect(recipe.tags).toContain("vegetarian");
      }
    }
  });

  it("keeps meat, seafood and fish sauce out of vegetarian dishes", () => {
    // "chay" here means lacto-ovo vegetarian: no meat, seafood or fish-derived
    // seasoning. Eggs, dairy and honey are allowed and do appear.
    const animalTerms = [
      "thịt",
      "bò",
      "heo",
      "gà",
      "cá",
      "tôm",
      "mực",
      "cua",
      "giò",
      "sườn",
      "chả",
      "lạp xưởng",
      "xương",
      "nước mắm",
      "mắm tôm",
      "mắm ruốc",
      "dầu hào",
      "mỡ",
      "pa tê",
    ];

    for (const recipe of SYSTEM_RECIPES) {
      if (!isVegetarian(recipe.tags)) {
        continue;
      }
      for (const ingredient of recipe.ingredients) {
        const name = ingredient.name.toLowerCase();
        // Whole-word containment, so "giò" does not flag "bột chiên giòn".
        const padded = ` ${name} `;
        const offending = animalTerms.filter((term) =>
          padded.includes(` ${term} `),
        );
        expect({ recipe: recipe.name, ingredient: name, offending }).toEqual({
          recipe: recipe.name,
          ingredient: name,
          offending: [],
        });
      }
    }
  });
});
