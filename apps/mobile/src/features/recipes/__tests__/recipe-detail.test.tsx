import { screen, waitFor, within } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { recipesApi } from "../../../api/recipes";
import RecipeDetailScreen from "../../../../app/recipe";
import { makeRecipe, makePantryMatch } from "./recipe-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "r1" }),
}));

jest.mock("../../../api/recipes", () => ({
  recipesApi: {
    getById: jest.fn(),
    pantryMatch: jest.fn(),
    comments: jest.fn(),
    setPublished: jest.fn(),
    addComment: jest.fn(),
  },
  mealPlansApi: {},
}));

jest.mock("../../../api/pantry", () => ({ pantryApi: { cook: jest.fn() } }));

const mockedGet = recipesApi.getById as jest.MockedFunction<typeof recipesApi.getById>;
const mockedMatch = recipesApi.pantryMatch as jest.MockedFunction<
  typeof recipesApi.pantryMatch
>;
const mockedComments = recipesApi.comments as jest.MockedFunction<
  typeof recipesApi.comments
>;

describe("RecipeDetailScreen pantry-match", () => {
  beforeEach(() => {
    mockedGet.mockReset().mockResolvedValue(makeRecipe());
    mockedMatch.mockReset().mockResolvedValue(makePantryMatch());
    mockedComments.mockReset().mockResolvedValue([]);
  });

  it("splits ingredients into có sẵn (on hand) and cần mua (to buy)", async () => {
    await renderWithProviders(<RecipeDetailScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("recipe-pantry-match")).toBeTruthy(),
    );

    const available = screen.getByTestId("recipe-pantry-match-available");
    const needed = screen.getByTestId("recipe-pantry-match-needed");

    // The available group holds the matched pantry ingredient…
    expect(within(available).getByText(/Bánh phở/)).toBeTruthy();
    // …and the needed group holds the missing one.
    expect(within(needed).getByText(/Thịt bò/)).toBeTruthy();
    expect(screen.getByTestId("recipe-match-score")).toBeTruthy();
  });
});
