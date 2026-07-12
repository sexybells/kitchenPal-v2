import type { ReactNode } from "react";
import { waitFor, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CookResult } from "@kitchenpal/api-contract";
import { pantryApi } from "../../../api/pantry";
import { useCook } from "../hooks";
import { recipeKeys } from "../../recipes/hooks";

jest.mock("../../../api/pantry", () => ({
  pantryApi: { cook: jest.fn() },
}));

const mockedCook = pantryApi.cook as jest.MockedFunction<typeof pantryApi.cook>;

const cookResult: CookResult = {
  consumed: [],
  unmatched: [],
  refillSuggestions: [],
};

describe("useCook cache invalidation", () => {
  it("invalidates the recipe pantry-match query so the split refreshes", async () => {
    mockedCook.mockReset().mockResolvedValue(cookResult);

    const client = new QueryClient();
    // Seed a fresh pantry-match query for a recipe.
    client.setQueryData(recipeKeys.pantryMatch("r1"), {
      matchScore: 1,
      available: [],
      needed: [],
    });
    expect(client.getQueryState(recipeKeys.pantryMatch("r1"))?.isInvalidated).toBe(
      false,
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useCook(), { wrapper });

    await waitFor(() => expect(result.current).toBeTruthy());
    result.current.mutate({ ingredients: [], idempotencyKey: "key-1" });

    // After a successful cook the pantry-match query is marked stale.
    await waitFor(() =>
      expect(
        client.getQueryState(recipeKeys.pantryMatch("r1"))?.isInvalidated,
      ).toBe(true),
    );
  });
});
