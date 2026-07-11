import { buildScopeFilter } from "./scope-filter";

describe("buildScopeFilter", () => {
  it("restricts personal scope to the owner", () => {
    expect(
      buildScopeFilter({ scope: "personal", userId: "u1" }),
    ).toEqual({ scope: "personal", createdBy: "u1" });
  });

  it("restricts household scope to the active household", () => {
    expect(
      buildScopeFilter({ scope: "household", userId: "u1", householdId: "h1" }),
    ).toEqual({ scope: "household", householdId: "h1" });
  });

  it("matches only server-owned documents for system scope", () => {
    expect(buildScopeFilter({ scope: "system", userId: "u1" })).toEqual({
      scope: "system",
    });
  });
});
