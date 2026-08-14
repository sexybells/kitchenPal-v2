import { screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { mealPlansApi, recipesApi } from "../../../api/recipes";
import { pantryApi } from "../../../api/pantry";
import { todayOfWeek } from "../labels";
import { makeMealPlan, makeSlot } from "./recipe-fixtures";
import HomeScreen from "../../../../app/(tabs)/index";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/recipes", () => ({
  recipesApi: { suggestFromPantry: jest.fn() },
  mealPlansApi: { current: jest.fn() },
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: { list: jest.fn(), refillSuggestions: jest.fn() },
}));

jest.mock("../../../api/hooks", () => ({
  useMe: () => ({ data: { displayName: "Hải", avatarUrl: null } }),
}));

const mockedPlan = mealPlansApi.current as jest.MockedFunction<
  typeof mealPlansApi.current
>;
const mockedSuggest = recipesApi.suggestFromPantry as jest.MockedFunction<
  typeof recipesApi.suggestFromPantry
>;
const mockedList = pantryApi.list as jest.MockedFunction<typeof pantryApi.list>;
const mockedRefill = pantryApi.refillSuggestions as jest.MockedFunction<
  typeof pantryApi.refillSuggestions
>;

function suggestion(id: string, name: string, available = 3, needed = 2) {
  return {
    recipeId: id,
    name,
    mealType: "dinner" as const,
    imageUrl: null,
    reason: "",
    matchScore: available / (available + needed),
    availableCount: available,
    neededCount: needed,
  };
}

describe("Home screen sections", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedRefill.mockReset().mockResolvedValue({ suggestions: [] });
    mockedPlan.mockReset();
    mockedSuggest
      .mockReset()
      .mockResolvedValue({ suggestions: [], provider: "none", degraded: true });
  });

  it("shows only today's slots from the weekly plan", async () => {
    const today = todayOfWeek();
    mockedPlan.mockResolvedValue(
      makeMealPlan({
        slots: [
          makeSlot({
            id: "today-dinner",
            dayOfWeek: today,
            mealType: "dinner",
            recipeId: "r1",
            recipeName: "Thịt kho trứng",
          }),
          makeSlot({
            id: "other-day",
            dayOfWeek: (today + 1) % 7,
            mealType: "dinner",
            recipeId: "r2",
            recipeName: "Cá kho tộ",
          }),
        ],
      }),
    );

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText("Thịt kho trứng")).toBeTruthy();
    // A meal planned for another day must not leak into "today".
    expect(screen.queryByText("Cá kho tộ")).toBeNull();
  });

  it("prompts to create a plan when there is none", async () => {
    mockedPlan.mockRejectedValue(new Error("404"));

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByTestId("home-today-empty")).toBeTruthy();
  });

  it("lists pantry-ranked suggestions with their ingredient counts", async () => {
    mockedPlan.mockRejectedValue(new Error("404"));
    mockedSuggest.mockResolvedValue({
      suggestions: [suggestion("r9", "Canh chua cá lóc", 4, 2)],
      provider: "none",
      degraded: true,
    });

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText("Canh chua cá lóc")).toBeTruthy();
    expect(screen.getByText("4 on hand · 2 to buy")).toBeTruthy();
  });

  it("asks for pantry items when nothing can be suggested", async () => {
    mockedPlan.mockRejectedValue(new Error("404"));

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByTestId("home-suggestions-empty")).toBeTruthy();
  });

  it("no longer renders the expiring-soon and running-low lists", async () => {
    mockedPlan.mockRejectedValue(new Error("404"));
    mockedRefill.mockResolvedValue({
      suggestions: [
        {
          pantryItemId: "p1",
          name: "nước mắm",
          category: "gia vị",
          quantity: 1,
          unit: "chai",
          stockState: "low" as const,
        },
      ],
    });

    await renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(mockedRefill).toHaveBeenCalled());
    // The refill data still feeds the stat row, but its list and the bulk
    // "add to shopping list" action moved to the pantry screen.
    expect(screen.queryByText("nước mắm")).toBeNull();
    expect(screen.queryByTestId("home-refill-add")).toBeNull();
  });
});
