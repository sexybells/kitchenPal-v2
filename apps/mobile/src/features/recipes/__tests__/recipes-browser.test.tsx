import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { recipesApi } from "../../../api/recipes";
import { RecipesBrowser } from "../RecipesBrowser";
import { makeRecipe } from "./recipe-fixtures";

// The `src/ui` barrel pulls in BottomNav (expo-router); mock it so the suite
// doesn't load expo-router's untransformed ESM tree.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/recipes", () => ({
  recipesApi: { list: jest.fn(), community: jest.fn(), favorites: jest.fn(), setFavorite: jest.fn() },
  mealPlansApi: {},
}));

const mockedList = recipesApi.list as jest.MockedFunction<typeof recipesApi.list>;
const mockedSetFavorite = recipesApi.setFavorite as jest.MockedFunction<
  typeof recipesApi.setFavorite
>;

describe("RecipesBrowser", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([
      makeRecipe({ id: "r1", name: "Phở bò" }),
      makeRecipe({ id: "r2", name: "Bún chả" }),
    ]);
    mockedSetFavorite.mockReset().mockResolvedValue(true);
  });

  it("renders the recipe grid and toggles a favorite optimistically", async () => {
    await renderWithProviders(
      <RecipesBrowser onOpenRecipe={jest.fn()} onImport={jest.fn()} />,
    );

    await waitFor(() => expect(screen.getByTestId("recipe-card-r1")).toBeTruthy());
    expect(screen.getByTestId("recipe-card-r2")).toBeTruthy();

    const heart = screen.getByTestId("recipe-card-r1-fav");
    expect(heart.props.accessibilityState.selected).toBe(false);

    fireEvent.press(heart);

    // The overlay flips immediately (optimistic) before the request resolves.
    await waitFor(() =>
      expect(
        screen.getByTestId("recipe-card-r1-fav").props.accessibilityState.selected,
      ).toBe(true),
    );
    expect(mockedSetFavorite).toHaveBeenCalledWith("r1", true);
  });
});
