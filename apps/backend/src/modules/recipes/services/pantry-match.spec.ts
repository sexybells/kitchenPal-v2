import { matchIngredients, type PantryStockLike } from "./pantry-match";

function ingredient(name: string, optional = false) {
  return { name, quantity: null, unit: null, optional };
}

function stock(
  name: string,
  inStock = true,
  expiryDate: Date | null = null,
  id = name,
): PantryStockLike {
  return { id, name, stockState: inStock ? "plenty" : "out", expiryDate };
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

describe("matchIngredients with Vietnamese names", () => {
  it("matches a whole accented word, not its accent-stripped fragments", () => {
    const result = matchIngredients(
      [ingredient("thịt ba chỉ"), ingredient("nước mắm")],
      [stock("thịt ba chỉ"), stock("nước mắm")],
    );
    expect(result.available).toHaveLength(2);
  });

  it("keeps ingredients distinct when only the diacritics differ", () => {
    // "cá" and "cà chua" share no whole word — stripping diacritics would make
    // a pantry with fish report tomatoes as on hand.
    const result = matchIngredients([ingredient("cà chua")], [stock("cá")]);
    expect(result.available).toHaveLength(0);

    const butter = matchIngredients([ingredient("bơ")], [stock("bò")]);
    expect(butter.available).toHaveLength(0);
  });

  it("still matches a broader pantry item to a narrower Vietnamese ingredient", () => {
    const result = matchIngredients(
      [ingredient("thịt bò nạm")],
      [stock("thịt bò")],
    );
    expect(result.available).toHaveLength(1);
  });

  it("matches across unicode normalization forms of the same name", () => {
    // Same word, decomposed (NFD) in the pantry vs composed (NFC) in the recipe.
    const result = matchIngredients(
      [ingredient("trứng gà".normalize("NFC"))],
      [stock("trứng gà".normalize("NFD"))],
    );
    expect(result.available).toHaveLength(1);
  });

  it("links an ingredient to the soonest-expiring of two same-name items", () => {
    const fresh = stock("cà chua", true, new Date("2026-12-30"), "fresh");
    const expiring = stock("cà chua", true, new Date("2026-11-26"), "expiring");
    const ingredients = [ingredient("cà chua"), ingredient("hành")];
    const onion = stock("hành");
    const pantry = [fresh, expiring, onion];

    const result = matchIngredients(ingredients, pantry);
    const unsorted = matchIngredients(ingredients, [expiring, fresh, onion]);

    expect(result.matches[0]?.pantryItemId).toBe("expiring");
    expect(result.matchScore).toBe(unsorted.matchScore);
    expect(result.available).toHaveLength(unsorted.available.length);
  });

  it("does not mutate the caller's pantry array", () => {
    const pantry = [
      stock("a", true, new Date("2026-12-30")),
      stock("b", true, new Date("2026-11-26")),
    ];
    matchIngredients([ingredient("a")], pantry);
    expect(pantry.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
