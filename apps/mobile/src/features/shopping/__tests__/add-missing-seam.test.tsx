import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { recipesApi } from "../../../api/recipes";
import { shoppingApi } from "../../../api/shopping";
import RecipeDetailScreen from "../../../../app/recipe";
import { makeRecipe, makePantryMatch } from "../../recipes/__tests__/recipe-fixtures";
import { makeList } from "./shopping-fixtures";

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

jest.mock("../../../api/shopping", () => ({
  shoppingApi: { addNeededItems: jest.fn() },
}));

const mockedGet = recipesApi.getById as jest.MockedFunction<typeof recipesApi.getById>;
const mockedMatch = recipesApi.pantryMatch as jest.MockedFunction<typeof recipesApi.pantryMatch>;
const mockedComments = recipesApi.comments as jest.MockedFunction<typeof recipesApi.comments>;
const mockedNeeded = shoppingApi.addNeededItems as jest.MockedFunction<
  typeof shoppingApi.addNeededItems
>;

describe("recipe add-missing seam", () => {
  beforeEach(() => {
    mockedGet.mockReset().mockResolvedValue(makeRecipe());
    mockedMatch.mockReset().mockResolvedValue(makePantryMatch());
    mockedComments.mockReset().mockResolvedValue([]);
    mockedNeeded.mockReset().mockResolvedValue(makeList());
  });

  it("posts the missing ingredients to POST /shopping/needed-items with the recipe id", async () => {
    await renderWithProviders(<RecipeDetailScreen />);

    await waitFor(() => expect(screen.getByTestId("recipe-add-missing")).toBeTruthy());
    fireEvent.press(screen.getByTestId("recipe-add-missing"));

    await waitFor(() => expect(mockedNeeded).toHaveBeenCalledTimes(1));
    expect(mockedNeeded).toHaveBeenCalledWith({
      items: [
        { name: "Thịt bò", quantity: 300, unit: "g", sourceRecipeId: "r1" },
      ],
    });

    // A success note confirms the hand-off without pretending nothing happened.
    await waitFor(() => expect(screen.getByTestId("recipe-cart-note")).toBeTruthy());
  });
});
