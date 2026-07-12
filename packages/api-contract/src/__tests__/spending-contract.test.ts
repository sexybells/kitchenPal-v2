import { describe, it, expect } from "vitest";
import {
  createBudgetSchema,
  createExpenseSchema,
  expenseItemInputSchema,
  moneySchema,
} from "../spending.js";

describe("spending contract", () => {
  it("rejects fractional đồng amounts (integer minor-unit-free VND)", () => {
    expect(() => moneySchema.parse(1500.5)).toThrow();
    expect(moneySchema.parse(1500)).toBe(1500);
  });

  it("defaults an expense category to groceries and items to empty", () => {
    const parsed = createExpenseSchema.parse({ totalAmount: 50000 });
    expect(parsed.category).toBe("groceries");
    expect(parsed.items).toEqual([]);
  });

  it("requires a positive quantity on an expense item", () => {
    expect(() =>
      expenseItemInputSchema.parse({ name: "Rice", quantity: 0, total: 1000 }),
    ).toThrow();
  });

  it("coerces an ISO expense date to a Date", () => {
    const parsed = createExpenseSchema.parse({
      totalAmount: 1000,
      date: "2026-07-01T00:00:00.000Z",
    });
    expect(parsed.date).toBeInstanceOf(Date);
  });

  it("requires a whole-đồng budget amount", () => {
    expect(() => createBudgetSchema.parse({ amount: -1 })).toThrow();
    expect(createBudgetSchema.parse({ amount: 3_000_000 }).amount).toBe(
      3_000_000,
    );
  });
});
