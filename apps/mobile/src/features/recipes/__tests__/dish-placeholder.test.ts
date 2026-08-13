import { dishPlaceholder } from "../dish-placeholder";

describe("dishPlaceholder", () => {
  it("picks the emoji from the dish, not just the meal type", () => {
    // Two dinners that must not look alike on the grid.
    expect(dishPlaceholder("Cá kho tộ", "dinner").emoji).toBe("🐟");
    expect(dishPlaceholder("Gà kho gừng", "dinner").emoji).toBe("🍗");
  });

  it("prefers the more specific keyword", () => {
    // "bánh mì" must win over "mì", "bắp xào" over the generic vegetable match.
    expect(dishPlaceholder("Bánh mì chả lụa", "breakfast").emoji).toBe("🥖");
    expect(dishPlaceholder("Mì Quảng", "lunch").emoji).toBe("🍜");
    expect(dishPlaceholder("Bắp xào bơ hành", "snack").emoji).toBe("🍿");
  });

  it("matches whole words only", () => {
    // "cà chua" must not trip the "cá" (fish) keyword.
    expect(dishPlaceholder("Bắp cải xào cà chua", "dinner").emoji).toBe("🥗");
  });

  it("falls back to the meal-type emoji for an unknown dish", () => {
    expect(dishPlaceholder("Beef Wellington", "dinner").emoji).toBe("🍲");
    expect(dishPlaceholder("", "breakfast").emoji).toBe("🥐");
  });

  it("is deterministic, so one dish looks the same on every screen", () => {
    const feed = dishPlaceholder("Phở bò", "lunch");
    const planner = dishPlaceholder("Phở bò", "lunch");
    expect(planner).toEqual(feed);
    // And unaffected by unicode normalization form or surrounding whitespace.
    expect(dishPlaceholder("  Phở bò  ".normalize("NFD"), "lunch")).toEqual(feed);
  });

  it("spreads dishes across the soft tints instead of one flat colour", () => {
    const names = [
      "Phở bò",
      "Cơm tấm sườn nướng",
      "Chè đậu xanh",
      "Canh chua cá lóc",
      "Xôi xéo",
      "Bánh flan",
    ];
    const tints = new Set(
      names.map((name) => dishPlaceholder(name, "dinner").background),
    );
    expect(tints.size).toBeGreaterThan(1);
  });

  it("only uses pale surface tints", () => {
    // A saturated brand colour behind a dark emoji would fail contrast.
    for (const name of ["Phở bò", "Bánh flan", "Su su xào tỏi", "Mì Quảng"]) {
      expect(dishPlaceholder(name, "dinner").background).toMatch(/-soft$/);
    }
  });
});
