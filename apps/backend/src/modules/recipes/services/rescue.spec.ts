import { matchIngredients, type PantryStockLike } from "./pantry-match";
import { findRescues, isAtRisk } from "./rescue";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-25T09:00:00.000Z");

function item(
  overrides: Partial<PantryStockLike> & { id: string; name: string },
): PantryStockLike {
  return { stockState: "plenty", expiryDate: null, ...overrides };
}

function ingredient(name: string, optional = false) {
  return { name, quantity: null, unit: null, optional };
}

describe("isAtRisk", () => {
  const at = (expiryDate: Date | null, stockState: PantryStockLike["stockState"] = "plenty") =>
    isAtRisk(item({ id: "x", name: "x", expiryDate, stockState }), now);

  it("is false when expiry equals now (already expired)", () => {
    expect(at(new Date(now))).toBe(false);
  });

  it("is true at exactly now + 3 days", () => {
    expect(at(new Date(now.getTime() + 3 * DAY))).toBe(true);
  });

  it("is false one millisecond past now + 3 days", () => {
    expect(at(new Date(now.getTime() + 3 * DAY + 1))).toBe(false);
  });

  it("is true shortly after now", () => {
    expect(at(new Date(now.getTime() + 1))).toBe(true);
  });

  it("is false for an out-of-stock item", () => {
    expect(at(new Date(now.getTime() + DAY), "out")).toBe(false);
  });

  it("is false without an expiry date", () => {
    expect(at(null)).toBe(false);
  });
});

describe("findRescues", () => {
  const stock = [
    item({ id: "tomato", name: "cà chua", expiryDate: new Date(now.getTime() + DAY) }),
    item({ id: "herb", name: "rau mùi", expiryDate: new Date(now.getTime() + DAY) }),
    item({ id: "rice", name: "gạo", expiryDate: new Date(now.getTime() + 30 * DAY) }),
  ];

  it("returns at-risk items used by required ingredients", () => {
    const match = matchIngredients([ingredient("cà chua"), ingredient("gạo")], stock);
    expect(findRescues(match, stock, now)).toEqual([
      { pantryItemId: "tomato", name: "cà chua", expiryDate: stock[0]?.expiryDate },
    ]);
  });

  it("ignores an at-risk item matched only by an optional ingredient", () => {
    const match = matchIngredients([ingredient("rau mùi", true)], stock);
    expect(findRescues(match, stock, now)).toEqual([]);
  });

  it("dedupes by pantry item", () => {
    const match = matchIngredients(
      [ingredient("cà chua"), ingredient("cà chua đỏ")],
      stock,
    );
    expect(findRescues(match, stock, now)).toHaveLength(1);
  });
});
