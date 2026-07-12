import type { PriceHistoryPoint, SpendingStats } from "@kitchenpal/api-contract";
import {
  buildCategoryBreakdown,
  buildTrendChart,
  buildSparkline,
} from "../analytics";
import { computeItemsTotal, buildExpensePayload } from "../expense-form-model";

describe("buildCategoryBreakdown", () => {
  it("computes each category's share, drops zeros, and sorts high-to-low", () => {
    const slices = buildCategoryBreakdown([
      { category: "groceries", total: 30000 },
      { category: "dining", total: 10000 },
      { category: "household", total: 0 },
    ]);

    expect(slices.map((slice) => slice.category)).toEqual(["groceries", "dining"]);
    expect(slices[0]!.ratio).toBeCloseTo(0.75);
    expect(slices[1]!.ratio).toBeCloseTo(0.25);
  });

  it("returns an empty breakdown when there is no spend", () => {
    expect(buildCategoryBreakdown([{ category: "other", total: 0 }])).toEqual([]);
  });
});

describe("buildTrendChart", () => {
  const size = { width: 100, height: 100, padding: 10 };

  it("scales points to the series max within the padded box", () => {
    const series: SpendingStats["series"] = [
      { period: "2026-07-01", total: 0 },
      { period: "2026-07-02", total: 50 },
      { period: "2026-07-03", total: 100 },
    ];
    const chart = buildTrendChart(series, size);

    expect(chart.max).toBe(100);
    // First point sits on the baseline, last on the top of the inner box.
    expect(chart.points[0]).toMatchObject({ x: 10, y: 90 });
    expect(chart.points[2]).toMatchObject({ x: 90, y: 10 });
    expect(chart.path.startsWith("M10 90")).toBe(true);
  });

  it("centers a single point and sits it on the baseline (no range to plot)", () => {
    const chart = buildTrendChart([{ period: "d", total: 5 }], size);
    expect(chart.points[0]!.x).toBe(50);
    expect(chart.points[0]!.y).toBe(90);
  });
});

describe("buildSparkline", () => {
  it("reverses newest-first points so the trend reads oldest-to-newest", () => {
    const points: PriceHistoryPoint[] = [
      { date: "2026-07-03", unitPrice: 100, quantity: 1 },
      { date: "2026-07-01", unitPrice: 0, quantity: 1 },
    ];
    const chart = buildSparkline(points, { width: 40, height: 20, padding: 0 });
    // Oldest (unitPrice 0) plots at the baseline on the left, newest at the top right.
    expect(chart.points[0]).toMatchObject({ x: 0, y: 20 });
    expect(chart.points[1]).toMatchObject({ x: 40, y: 0 });
  });
});

describe("expense form model", () => {
  it("sums line totals through the VND parser (never a float)", () => {
    expect(
      computeItemsTotal([
        { name: "a", quantity: 1, total: "12.000" },
        { name: "b", quantity: 2, total: "8000" },
        { name: "c", quantity: 1, total: "" },
      ]),
    ).toBe(20000);
  });

  it("builds an integer-VND payload from complete lines only", () => {
    const payload = buildExpensePayload({
      items: [
        { name: "Cà chua", quantity: 2, total: "12.000" },
        { name: "", quantity: 1, total: "5000" },
        { name: "Hành", quantity: 1, total: "" },
      ],
      category: "groceries",
      note: "  chợ sáng ",
      shoppingListId: "list1",
    });

    expect(payload).toEqual({
      totalAmount: 12000,
      category: "groceries",
      note: "chợ sáng",
      date: undefined,
      shoppingListId: "list1",
      items: [{ name: "Cà chua", quantity: 2, total: 12000 }],
    });
  });

  it("returns null when nothing valid is entered", () => {
    expect(
      buildExpensePayload({
        items: [{ name: "x", quantity: 1, total: "" }],
        category: "other",
        note: "",
      }),
    ).toBeNull();
  });
});
