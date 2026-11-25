import type { ScopeContext } from "../../../common/scope/scope-context";
import {
  RecipeSelectionService,
  type SelectionResult,
} from "./recipe-selection.service";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-25T09:00:00.000Z");
const scope: ScopeContext = { scope: "personal", userId: "u1", householdId: null };

function recipe(
  id: string,
  options: {
    tags?: string[];
    ingredients?: string[];
    averageRating?: number;
  } = {},
) {
  return {
    id,
    name: id,
    mealType: "dinner",
    tags: options.tags ?? [],
    averageRating: options.averageRating ?? 0,
    ingredients: (options.ingredients ?? []).map((name) => ({
      name,
      quantity: null,
      unit: null,
      optional: false,
    })),
  };
}

function build(
  recipes: ReturnType<typeof recipe>[],
  pantryItems: object[] = [],
  aiOrder: string[] | null = null,
) {
  const rank = jest.fn().mockResolvedValue(
    aiOrder
      ? { order: aiOrder, provider: "openai", degraded: false }
      : { order: null, provider: "none", degraded: true },
  );
  const service = new RecipeSelectionService(
    { findCandidates: jest.fn().mockResolvedValue(recipes) } as never,
    { findForOwner: jest.fn().mockResolvedValue(null) } as never,
    { find: jest.fn().mockResolvedValue(pantryItems) } as never,
    { rank } as never,
  );
  return { service, rank };
}

function select(
  service: RecipeSelectionService,
  options: { vegetarianDay?: boolean; useAi?: boolean } = {},
) {
  return service.select(scope, {
    operation: "test",
    goal: "dinner",
    userId: "u1",
    context: { now, vegetarianDay: options.vegetarianDay ?? false },
    useAi: options.useAi,
  });
}

const ids = (result: SelectionResult) =>
  result.ranked.map((entry) => entry.doc.id);

describe("RecipeSelectionService ranking", () => {
  it("orders by vegetarian, then rescues, then matchScore, then rating", async () => {
    const pantry = [
      {
        id: "p1",
        name: "cà chua",
        stockState: "plenty",
        expiryDate: new Date(now.getTime() + DAY),
      },
      { id: "p2", name: "hành", stockState: "plenty", expiryDate: null },
    ];
    const { service } = build(
      [
        recipe("meat-rescue", { ingredients: ["cà chua"] }),
        recipe("veg-nomatch", { tags: ["chay"], ingredients: ["nấm"] }),
        recipe("veg-match", { tags: ["Chay"], ingredients: ["hành"] }),
        recipe("meat-match-top", { ingredients: ["hành"], averageRating: 5 }),
        recipe("meat-match-low", { ingredients: ["hành"], averageRating: 1 }),
      ],
      pantry,
    );

    const result = await select(service, { vegetarianDay: true, useAi: false });

    expect(ids(result)).toEqual([
      "veg-match",
      "veg-nomatch",
      "meat-rescue",
      "meat-match-top",
      "meat-match-low",
    ]);
    expect(result.ranked[2]?.rescues.map((r) => r.pantryItemId)).toEqual(["p1"]);
    expect(result.ranked[0]?.isVegetarian).toBe(true);
  });

  it("ranks by rescues before matchScore when it is not a vegetarian day", async () => {
    const pantry = [
      {
        id: "p1",
        name: "cà chua",
        stockState: "plenty",
        expiryDate: new Date(now.getTime() + DAY),
      },
      { id: "p2", name: "hành", stockState: "plenty", expiryDate: null },
    ];
    const { service } = build(
      [
        recipe("full-match", { ingredients: ["hành"] }),
        recipe("rescue", { ingredients: ["cà chua", "nấm"] }),
        recipe("veg", { tags: ["chay"], ingredients: ["hành"] }),
      ],
      pantry,
    );

    const result = await select(service, { useAi: false });

    expect(ids(result)).toEqual(["rescue", "full-match", "veg"]);
  });

  it("keeps non-vegetarian recipes (after the chay ones) on a vegetarian day", async () => {
    const { service } = build([
      recipe("meat", { averageRating: 5 }),
      recipe("veg", { tags: ["chay"], averageRating: 1 }),
    ]);

    const result = await select(service, { vegetarianDay: true, useAi: false });

    expect(ids(result)).toEqual(["veg", "meat"]);
  });

  it("applies the vegetarian partition after the AI order, keeping AI order inside groups", async () => {
    const { service, rank } = build(
      [
        recipe("meat-1"),
        recipe("veg-1", { tags: ["chay"] }),
        recipe("meat-2"),
        recipe("veg-2", { tags: ["chay"] }),
      ],
      [],
      ["meat-1", "veg-2", "meat-2", "veg-1"],
    );

    const result = await select(service, { vegetarianDay: true });

    expect(ids(result)).toEqual(["veg-2", "veg-1", "meat-1", "meat-2"]);
    expect(result.provider).toBe("openai");
    expect(result.degraded).toBe(false);
    const goal = rank.mock.calls[0][1] as string;
    expect(goal).toContain("vegetarian day");
    expect(goal).toContain("expiry");
  });

  it("keeps the AI order untouched when it is not a vegetarian day", async () => {
    const { service, rank } = build(
      [recipe("meat"), recipe("veg", { tags: ["chay"] })],
      [],
      ["meat", "veg"],
    );

    const result = await select(service);

    expect(ids(result)).toEqual(["meat", "veg"]);
    expect(rank.mock.calls[0][1] as string).not.toContain("vegetarian day");
  });

  it("sends rescueCount and isVegetarian to the AI ranker", async () => {
    const pantry = [
      {
        id: "p1",
        name: "cà chua",
        stockState: "plenty",
        expiryDate: new Date(now.getTime() + DAY),
      },
    ];
    const { service, rank } = build(
      [recipe("veg", { tags: ["chay"], ingredients: ["cà chua"] })],
      pantry,
    );

    await select(service);

    expect(rank.mock.calls[0][2]).toEqual([
      expect.objectContaining({
        recipeId: "veg",
        rescueCount: 1,
        isVegetarian: true,
      }),
    ]);
  });

  it("does not call the AI ranker with useAi: false", async () => {
    const { service, rank } = build([recipe("a")]);

    const result = await select(service, { useAi: false });

    expect(rank).not.toHaveBeenCalled();
    expect(result.provider).toBe("none");
    expect(result.degraded).toBe(true);
  });
});
