import type { Model } from "mongoose";
import type { SystemRecipeSeed } from "../data/system-recipe";
import type { RecipeEntity } from "../repositories/recipe.repository";
import { SystemRecipeSeederService } from "./system-recipe-seeder.service";

const SEEDS: SystemRecipeSeed[] = [
  {
    name: "Canh chua cá lóc",
    mealType: "dinner",
    cookTimeMinutes: 40,
    servings: 4,
    tags: ["canh", "cá"],
    ingredients: [{ name: "cá lóc", quantity: 600, unit: "g" }],
    steps: ["Nấu nước me.", "Thả cá vào nấu chín."],
  },
  {
    name: "Su su xào tỏi",
    mealType: "dinner",
    cookTimeMinutes: 15,
    servings: 4,
    tags: ["chay", "vegetarian"],
    ingredients: [{ name: "su su", quantity: 2, unit: "trái" }],
    steps: ["Thái su su.", "Xào với tỏi."],
  },
];

type StoredDoc = Record<string, unknown>;
type UpdateOutcome = { upsertedCount: number; modifiedCount: number };

/** The stored shape of a seed, as the seeder would have written it. */
function stored(seed: SystemRecipeSeed, overrides: StoredDoc = {}): StoredDoc {
  return {
    name: seed.name,
    mealType: seed.mealType,
    tags: [...seed.tags],
    cookTimeMinutes: seed.cookTimeMinutes,
    servings: seed.servings,
    ingredients: seed.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit ?? null,
      optional: ingredient.optional ?? false,
    })),
    steps: [...seed.steps],
    sourceType: "system",
    published: true,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Minimal stand-in for the Mongoose model: enough of the fluent chain for the
 * seeder's read-then-upsert, with scripted answers per call.
 */
function buildModel(options: {
  existing: (StoredDoc | null)[];
  updates?: (UpdateOutcome | Error)[];
}) {
  const existing = [...options.existing];
  const updates = [...(options.updates ?? [])];
  const updateCalls: Record<string, unknown>[] = [];

  const model = {
    findOne: () => ({
      lean: () => ({
        exec: () => Promise.resolve(existing.shift() ?? null),
      }),
    }),
    updateOne: (filter: Record<string, unknown>) => {
      updateCalls.push(filter);
      const next = updates.shift() ?? { upsertedCount: 1, modifiedCount: 0 };
      return {
        exec: () =>
          next instanceof Error ? Promise.reject(next) : Promise.resolve(next),
      };
    },
  } as unknown as Model<RecipeEntity>;

  return { model, updateCalls };
}

describe("SystemRecipeSeederService", () => {
  it("inserts every seed on a fresh database", async () => {
    const { model, updateCalls } = buildModel({ existing: [null, null] });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    expect(result).toEqual({ created: 2, updated: 0, skipped: 0, total: 2 });
    // Upserts are keyed on the normalized name within the system scope.
    expect(updateCalls[0]).toMatchObject({
      normalizedName: "canh chua cá lóc",
      scope: "system",
      deletedAt: null,
    });
  });

  it("writes nothing when the stored content already matches the seed", async () => {
    const { model, updateCalls } = buildModel({
      existing: [stored(SEEDS[0]!), stored(SEEDS[1]!)],
    });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    expect(result).toEqual({ created: 0, updated: 0, skipped: 2, total: 2 });
    // Not "an update that changed nothing" — no write is issued at all.
    expect(updateCalls).toHaveLength(0);
  });

  it("refreshes a recipe whose authored content drifted from the seed", async () => {
    const { model, updateCalls } = buildModel({
      existing: [
        stored(SEEDS[0]!, { steps: ["Công thức cũ."] }),
        stored(SEEDS[1]!),
      ],
      updates: [{ upsertedCount: 0, modifiedCount: 1 }],
    });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    expect(result).toEqual({ created: 0, updated: 1, skipped: 1, total: 2 });
    expect(updateCalls).toHaveLength(1);
  });

  it("detects a changed ingredient, not just a changed name", async () => {
    const { model } = buildModel({
      existing: [
        stored(SEEDS[0]!, {
          ingredients: [
            { name: "cá lóc", quantity: 400, unit: "g", optional: false },
          ],
        }),
        stored(SEEDS[1]!),
      ],
      updates: [{ upsertedCount: 0, modifiedCount: 1 }],
    });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    expect(result.updated).toBe(1);
  });

  it("leaves an admin-removed recipe deleted instead of resurrecting it", async () => {
    const { model, updateCalls } = buildModel({
      existing: [stored(SEEDS[0]!, { deletedAt: new Date() }), null],
    });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, total: 2 });
    // Only the second seed was written; the removed one was never touched.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ normalizedName: "su su xào tỏi" });
  });

  it("tolerates a concurrent insert losing the unique-index race", async () => {
    const duplicate = Object.assign(new Error("E11000 duplicate key"), {
      code: 11000,
    });
    const { model } = buildModel({
      existing: [null, null],
      updates: [duplicate, { upsertedCount: 1, modifiedCount: 0 }],
    });

    const result = await new SystemRecipeSeederService(model).seed(null, SEEDS);

    // The other writer's row is the correct converged state, not an error.
    expect(result).toEqual({ created: 1, updated: 0, skipped: 1, total: 2 });
  });

  it("propagates a genuine write failure", async () => {
    const { model } = buildModel({
      existing: [null],
      updates: [new Error("connection lost")],
    });

    await expect(
      new SystemRecipeSeederService(model).seed(null, SEEDS.slice(0, 1)),
    ).rejects.toThrow("connection lost");
  });
});
