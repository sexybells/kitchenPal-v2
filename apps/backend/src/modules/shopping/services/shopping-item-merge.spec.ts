import { dedupeNeededItems, mergeNeededIntoItems } from "./shopping-item-merge";
import type { MergeableItem, NeededItem } from "./shopping-item-merge";

function needed(overrides: Partial<NeededItem>): NeededItem {
  return {
    name: "Milk",
    quantity: null,
    unit: null,
    category: null,
    sourceRecipeId: null,
    ...overrides,
  };
}

describe("dedupeNeededItems", () => {
  it("sums quantities of same name + unit, case/space-insensitive", () => {
    const result = dedupeNeededItems([
      needed({ name: "Flour", quantity: 2, unit: "cups" }),
      needed({ name: "  flour ", quantity: 3, unit: "Cups" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(5);
  });

  it("keeps different units as separate lines", () => {
    const result = dedupeNeededItems([
      needed({ name: "Milk", quantity: 1, unit: "l" }),
      needed({ name: "Milk", quantity: 2, unit: "cups" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("leaves quantity untouched when one side is null", () => {
    const result = dedupeNeededItems([
      needed({ name: "Salt", quantity: null }),
      needed({ name: "Salt", quantity: 1 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBeNull();
  });

  it("keeps the first sourceRecipeId across recipes", () => {
    const result = dedupeNeededItems([
      needed({ name: "Egg", sourceRecipeId: "a" }),
      needed({ name: "Egg", sourceRecipeId: "b" }),
    ]);
    expect(result[0]?.sourceRecipeId).toBe("a");
  });
});

describe("mergeNeededIntoItems", () => {
  const existing: MergeableItem[] = [
    {
      id: "x1",
      name: "Milk",
      quantity: 1,
      unit: "l",
      category: null,
      bought: true,
      sourceRecipeId: null,
    },
  ];

  it("preserves an existing line (and its bought state), never duplicating", () => {
    const result = mergeNeededIntoItems(existing, [
      needed({ name: "milk", unit: "l", quantity: 5 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.bought).toBe(true);
    expect(result[0]?.quantity).toBe(1);
  });

  it("appends genuinely new items with a fresh id and bought false", () => {
    const result = mergeNeededIntoItems(existing, [
      needed({ name: "Bread", unit: "loaf" }),
    ]);
    expect(result).toHaveLength(2);
    const added = result[1];
    expect(added?.name).toBe("Bread");
    expect(added?.bought).toBe(false);
    expect(added?.id).toBeTruthy();
  });

  it("is idempotent when replayed", () => {
    const once = mergeNeededIntoItems(existing, [needed({ name: "Bread" })]);
    const twice = mergeNeededIntoItems(once, [needed({ name: "Bread" })]);
    expect(twice).toHaveLength(once.length);
  });
});
