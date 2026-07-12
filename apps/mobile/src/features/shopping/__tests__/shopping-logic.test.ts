import { groupByCategory, summarize, UNCATEGORIZED } from "../grouping";
import { buildExpenseDraftFromList } from "../expense-draft";
import { makeItem, makeList } from "./shopping-fixtures";

describe("groupByCategory", () => {
  it("groups by category in first-seen order and buckets null under 'other'", () => {
    const groups = groupByCategory([
      makeItem({ id: "a", category: "produce" }),
      makeItem({ id: "b", category: null }),
      makeItem({ id: "c", category: "produce" }),
    ]);

    expect(groups.map((group) => group.category)).toEqual(["produce", UNCATEGORIZED]);
    expect(groups[0]!.items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("sorts bought items below unbought within a section", () => {
    const group = groupByCategory([
      makeItem({ id: "a", category: "dairy", bought: true }),
      makeItem({ id: "b", category: "dairy", bought: false }),
    ])[0]!;
    expect(group.items.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("summarize", () => {
  it("counts bought / remaining and flags a fully-checked list", () => {
    expect(
      summarize([makeItem({ bought: true }), makeItem({ id: "i2", bought: false })]),
    ).toEqual({ total: 2, bought: 1, remaining: 1, complete: false });

    expect(summarize([makeItem({ bought: true })])).toMatchObject({ complete: true });
    expect(summarize([])).toMatchObject({ complete: false });
  });
});

describe("buildExpenseDraftFromList", () => {
  it("prefills only the bought lines, links the list, and blanks prices", () => {
    const list = makeList({
      id: "list9",
      items: [
        makeItem({ id: "a", name: "Cà chua", quantity: 2, bought: true }),
        makeItem({ id: "b", name: "Hành lá", bought: false }),
        makeItem({ id: "c", name: "Thịt bò", quantity: 0, bought: true }),
      ],
    });

    const draft = buildExpenseDraftFromList(list);

    expect(draft.shoppingListId).toBe("list9");
    expect(draft.items).toEqual([
      { name: "Cà chua", quantity: 2, total: "" },
      // A non-positive quantity falls back to 1 so the expense line is valid.
      { name: "Thịt bò", quantity: 1, total: "" },
    ]);
  });
});
