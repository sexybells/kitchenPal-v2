import { normalizeItemName, priceExpenseItems } from "./expense-pricing";

describe("priceExpenseItems", () => {
  it("derives unit price as round(total / quantity) in whole đồng", () => {
    const [item] = priceExpenseItems([
      { name: "Rice", quantity: 2, total: 50000 },
    ]);
    expect(item?.unitPrice).toBe(25000);
    expect(item?.total).toBe(50000);
  });

  it("rounds to an integer so VND never carries a fractional đồng", () => {
    const [item] = priceExpenseItems([
      { name: "Egg", quantity: 3, total: 10000 },
    ]);
    // 10000 / 3 = 3333.33… → 3333, still an integer.
    expect(item?.unitPrice).toBe(3333);
    expect(Number.isInteger(item?.unitPrice)).toBe(true);
  });

  it("normalizes the item name for price-history grouping", () => {
    const [item] = priceExpenseItems([
      { name: "  Brown  Rice ", quantity: 1, total: 1000 },
    ]);
    expect(item?.normalizedName).toBe("brown rice");
  });
});

describe("normalizeItemName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeItemName("  Whole   Milk ")).toBe("whole milk");
  });
});
