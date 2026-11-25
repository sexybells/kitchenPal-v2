import { describe, it, expect } from "vitest";
import {
  createRecipeSchema,
  updateSlotSchema,
  createMealPlanSchema,
  communityQuerySchema,
  suggestionQuerySchema,
  suggestionsResponseSchema,
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

describe("suggestions response contract", () => {
  const sample = {
    suggestions: [
      {
        recipeId: "r1",
        name: "Canh chua",
        mealType: "dinner",
        imageUrl: null,
        reason: "Uses what you have",
        matchScore: 0.8,
        availableCount: 4,
        neededCount: 1,
        rescues: [{ name: "Tomato", expiryDate: "2026-11-27" }],
        isVegetarian: true,
      },
    ],
    provider: "none",
    degraded: true,
    day: {
      date: "2026-11-25",
      lunar: { day: 15, month: 10, year: 2026, isLeapMonth: false },
      vegetarianDay: true,
      vegetarianPriority: true,
    },
  };

  it("parses rescues, isVegetarian and day", () => {
    const parsed = suggestionsResponseSchema.parse(sample);
    expect(parsed.suggestions[0]?.rescues).toHaveLength(1);
    expect(parsed.day.lunar.day).toBe(15);
  });

  it("rejects a response missing day", () => {
    const { day: _day, ...withoutDay } = sample;
    expect(suggestionsResponseSchema.safeParse(withoutDay).success).toBe(false);
  });
});
