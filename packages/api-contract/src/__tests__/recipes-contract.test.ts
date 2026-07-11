import { describe, it, expect } from "vitest";
import {
  createRecipeSchema,
  updateSlotSchema,
  createMealPlanSchema,
  communityQuerySchema,
  suggestionQuerySchema,
  confirmImportSchema,
} from "../index.js";

describe("recipes contract", () => {
  it("applies defaults when creating a recipe", () => {
    const parsed = createRecipeSchema.parse({ name: "Pho" });
    expect(parsed.mealType).toBe("dinner");
    expect(parsed.tags).toEqual([]);
    expect(parsed.ingredients).toEqual([]);
    expect(parsed.steps).toEqual([]);
  });

  it("marks ingredient optional as false by default", () => {
    const parsed = createRecipeSchema.parse({
      name: "Salad",
      ingredients: [{ name: "Lettuce" }],
    });
    expect(parsed.ingredients[0].optional).toBe(false);
  });

  it("defaults the community sort to rating", () => {
    expect(communityQuerySchema.parse({}).sort).toBe("rating");
  });

  it("defaults the suggestion limit", () => {
    expect(suggestionQuerySchema.parse({}).limit).toBe(6);
  });

  it("requires an expected version for a slot edit", () => {
    expect(() =>
      updateSlotSchema.parse({ recipeId: null }),
    ).toThrow();
  });

  it("accepts a null recipeId to clear a slot", () => {
    const parsed = updateSlotSchema.parse({
      recipeId: null,
      expectedVersion: 3,
    });
    expect(parsed.recipeId).toBeNull();
  });

  it("defaults meal-plan meal types to the three main meals", () => {
    const parsed = createMealPlanSchema.parse({
      weekStart: "2026-07-13T00:00:00.000Z",
    });
    expect(parsed.mealTypes).toEqual(["breakfast", "lunch", "dinner"]);
    expect(parsed.weekStart).toBeInstanceOf(Date);
  });

  it("requires a draft to confirm an import", () => {
    expect(() => confirmImportSchema.parse({})).toThrow();
    const parsed = confirmImportSchema.parse({
      draft: { name: "Imported dish" },
    });
    expect(parsed.draft.name).toBe("Imported dish");
    expect(parsed.draft.mealType).toBe("dinner");
  });
});
