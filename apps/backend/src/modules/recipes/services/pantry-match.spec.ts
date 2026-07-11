import { matchIngredients, type PantryStockLike } from "./pantry-match";

function ingredient(name: string, optional = false) {
  return { name, quantity: null, unit: null, optional };
}

function stock(name: string, inStock = true): PantryStockLike {
  return { id: name, name, stockState: inStock ? "plenty" : "out" };
}

describe("matchIngredients", () => {
  it("matches whole-word tokens, not substrings", () => {
    const result = matchIngredients(
      [ingredient("eggplant"), ingredient("2 cups flour")],
      [stock("egg"), stock("flour")],
    );
    const byName = new Map(
      result.matches.map((m) => [m.ingredient.name, m.available]),
    );
    // "egg" must NOT satisfy "eggplant" (substring false-positive avoided).
    expect(byName.get("eggplant")).toBe(false);
    // "flour" still satisfies "2 cups flour" via token containment.
    expect(byName.get("2 cups flour")).toBe(true);
  });

  it("does not treat 'salt' as 'salted butter'", () => {
    const result = matchIngredients(
      [ingredient("salted butter")],
      [stock("salt")],
    );
    expect(result.needed.map((m) => m.ingredient.name)).toEqual([
      "salted butter",
    ]);
  });

  it("matches a broader pantry item to a narrower ingredient", () => {
    const result = matchIngredients(
      [ingredient("chicken breast")],
      [stock("chicken")],
    );
    expect(result.available).toHaveLength(1);
  });

  it("classifies out-of-stock items as needed", () => {
    const result = matchIngredients(
      [ingredient("flour")],
      [stock("flour", false)],
    );
    expect(result.needed).toHaveLength(1);
  });

  it("never matches a blank ingredient name to a pantry item", () => {
    const result = matchIngredients([ingredient("   ")], [stock("flour")]);
    expect(result.available).toHaveLength(0);
    expect(result.needed).toHaveLength(1);
  });

  it("scores over required ingredients only", () => {
    const result = matchIngredients(
      [ingredient("flour"), ingredient("sprinkles", true)],
      [stock("flour")],
    );
    // Required flour is on hand; the optional sprinkles do not lower the score.
    expect(result.matchScore).toBe(1);
  });
});
