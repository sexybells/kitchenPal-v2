import { describe, it, expect } from "vitest";
import {
  addNeededItemsSchema,
  addShoppingItemSchema,
  deleteShoppingItemSchema,
  generateShoppingSchema,
  updateShoppingItemSchema,
} from "../shopping.js";

describe("shopping contract", () => {
  it("requires a valid meal plan id to generate", () => {
    expect(() => generateShoppingSchema.parse({ mealPlanId: "nope" })).toThrow();
    const parsed = generateShoppingSchema.parse({
      mealPlanId: "0123456789abcdef01234567",
    });
    expect(parsed.mealPlanId).toBe("0123456789abcdef01234567");
  });

  it("requires at least one needed item in a hand-off", () => {
    expect(() => addNeededItemsSchema.parse({ items: [] })).toThrow();
    const parsed = addNeededItemsSchema.parse({ items: [{ name: "Milk" }] });
    expect(parsed.items[0].name).toBe("Milk");
  });

  it("requires an expectedVersion when adding an item", () => {
    expect(() => addShoppingItemSchema.parse({ name: "Eggs" })).toThrow();
    const parsed = addShoppingItemSchema.parse({
      name: "Eggs",
      expectedVersion: 3,
    });
    expect(parsed.expectedVersion).toBe(3);
  });

  it("allows toggling bought with a version guard", () => {
    const parsed = updateShoppingItemSchema.parse({
      bought: true,
      expectedVersion: 1,
    });
    expect(parsed.bought).toBe(true);
  });

  it("coerces a query-string expectedVersion on delete", () => {
    const parsed = deleteShoppingItemSchema.parse({ expectedVersion: "2" });
    expect(parsed.expectedVersion).toBe(2);
  });
});
