import {
  applyDepletion,
  deriveStockState,
  needsRefill,
  stepStockStateDown,
} from "./stock-state";

describe("stock-state derivation", () => {
  it("maps quantity to the assistive level", () => {
    expect(deriveStockState(0)).toBe("out");
    expect(deriveStockState(1)).toBe("low");
    expect(deriveStockState(3)).toBe("some");
    expect(deriveStockState(10)).toBe("plenty");
  });

  it("steps the assistive level down and clamps at out", () => {
    expect(stepStockStateDown("plenty")).toBe("some");
    expect(stepStockStateDown("some")).toBe("low");
    expect(stepStockStateDown("low")).toBe("out");
    expect(stepStockStateDown("out")).toBe("out");
    expect(stepStockStateDown("plenty", 2)).toBe("low");
  });

  it("flags low and out as needing a refill", () => {
    expect(needsRefill("plenty")).toBe(false);
    expect(needsRefill("some")).toBe(false);
    expect(needsRefill("low")).toBe(true);
    expect(needsRefill("out")).toBe(true);
  });

  it("depletes a quantity-tracked item and flips the level some→low→out", () => {
    const start = { quantity: 4, stockState: "plenty" as const, trackingMode: "exact" as const };
    const some = applyDepletion(start, { amount: 1 });
    expect(some).toEqual({ quantity: 3, stockState: "some" });

    const low = applyDepletion(
      { ...start, quantity: some.quantity, stockState: some.stockState },
      { amount: 2 },
    );
    expect(low).toEqual({ quantity: 1, stockState: "low" });

    const out = applyDepletion(
      { ...start, quantity: low.quantity, stockState: low.stockState },
      { amount: 5 },
    );
    expect(out).toEqual({ quantity: 0, stockState: "out" });
  });

  it("steps a state-only item down without touching quantity", () => {
    const result = applyDepletion(
      { quantity: 0, stockState: "some", trackingMode: "state_only" },
      { steps: 1 },
    );
    expect(result).toEqual({ quantity: 0, stockState: "low" });
  });

  it("ignores a passed amount for a state-only item", () => {
    const result = applyDepletion(
      { quantity: 0, stockState: "plenty", trackingMode: "state_only" },
      { amount: 99 },
    );
    expect(result.stockState).toBe("some");
    expect(result.quantity).toBe(0);
  });

  it("keeps quantity consistent when a tracked item is stepped without an amount", () => {
    const result = applyDepletion(
      { quantity: 10, stockState: "plenty", trackingMode: "exact" },
      { steps: 1 },
    );
    expect(result.stockState).toBe("some");
    // Quantity follows the new level so a later amount-based consume cannot
    // re-derive and reverse the step-down.
    expect(deriveStockState(result.quantity)).toBe("some");
  });
});
