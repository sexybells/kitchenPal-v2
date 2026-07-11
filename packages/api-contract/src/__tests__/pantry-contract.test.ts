import { describe, it, expect } from "vitest";
import {
  createPantryItemSchema,
  consumePantrySchema,
  cookMealSchema,
  pantryItemQuerySchema,
  confirmScanSchema,
  stockStateSchema,
} from "../pantry.js";

describe("pantry contract", () => {
  it("applies assistive defaults when creating an item", () => {
    const parsed = createPantryItemSchema.parse({
      name: "Milk",
      category: "Dairy",
    });
    expect(parsed.stockState).toBe("plenty");
    expect(parsed.trackingMode).toBe("state_only");
  });

  it("coerces an ISO expiry string into a Date", () => {
    const parsed = createPantryItemSchema.parse({
      name: "Yogurt",
      category: "Dairy",
      expiryDate: "2026-08-01T00:00:00.000Z",
    });
    expect(parsed.expiryDate).toBeInstanceOf(Date);
  });

  it("orders stock states from strongest to weakest", () => {
    expect(stockStateSchema.options).toEqual(["plenty", "some", "low", "out"]);
  });

  it("requires at least one item to consume", () => {
    expect(() => consumePantrySchema.parse({ items: [] })).toThrow();
  });

  it("rejects a non-ObjectId pantryItemId", () => {
    expect(() =>
      consumePantrySchema.parse({ items: [{ pantryItemId: "nope" }] }),
    ).toThrow();
  });

  it("accepts a 24-hex pantryItemId and an idempotency key", () => {
    const parsed = consumePantrySchema.parse({
      items: [{ pantryItemId: "0123456789abcdef01234567", quantity: 1 }],
      idempotencyKey: "retry-1",
    });
    expect(parsed.idempotencyKey).toBe("retry-1");
  });

  it("requires at least one ingredient to cook", () => {
    expect(() => cookMealSchema.parse({ ingredients: [] })).toThrow();
  });

  it("defaults the list sort to expiry", () => {
    expect(pantryItemQuerySchema.parse({}).sort).toBe("expiry");
  });

  it("defaults confirmed scan items to assistive tracking", () => {
    const parsed = confirmScanSchema.parse({
      items: [{ name: "Eggs", category: "Dairy" }],
    });
    expect(parsed.items[0].trackingMode).toBe("state_only");
    expect(parsed.items[0].stockState).toBe("plenty");
  });
});
