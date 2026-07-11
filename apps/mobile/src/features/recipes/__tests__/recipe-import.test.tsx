import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { recipesApi } from "../../../api/recipes";
import RecipeImportScreen from "../../../../app/recipe-import";
import { makeDraft, makeRecipe } from "./recipe-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/recipes", () => ({
  recipesApi: {
    importFromUrl: jest.fn(),
    confirmImport: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
  },
  mealPlansApi: {},
}));

const mockedImport = recipesApi.importFromUrl as jest.MockedFunction<
  typeof recipesApi.importFromUrl
>;
const mockedConfirm = recipesApi.confirmImport as jest.MockedFunction<
  typeof recipesApi.confirmImport
>;

describe("RecipeImportScreen", () => {
  beforeEach(() => {
    mockedImport
      .mockReset()
      .mockResolvedValue({ draft: makeDraft(), degraded: false, warnings: [] });
    mockedConfirm.mockReset().mockResolvedValue(makeRecipe({ id: "created" }));
  });

  it("imports a URL, previews the draft, and confirms the edited draft", async () => {
    await renderWithProviders(<RecipeImportScreen />);

    fireEvent.changeText(
      screen.getByTestId("import-url"),
      "https://example.com/recipe",
    );
    // Let the controlled value flush before the press reads it.
    await waitFor(() =>
      expect(screen.getByTestId("import-url").props.value).toBe(
        "https://example.com/recipe",
      ),
    );
    fireEvent.press(screen.getByTestId("import-fetch"));

    // The parsed draft is shown for review with its scraped name.
    await waitFor(() =>
      expect(screen.getByTestId("draft-name").props.value).toBe("Imported Dish"),
    );

    // The user edits the name before confirming.
    fireEvent.changeText(screen.getByTestId("draft-name"), "My Edited Dish");
    await waitFor(() =>
      expect(screen.getByTestId("draft-name").props.value).toBe("My Edited Dish"),
    );
    fireEvent.press(screen.getByTestId("import-confirm"));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(1));
    const payload = mockedConfirm.mock.calls[0]![0];
    expect(payload.draft.name).toBe("My Edited Dish");
    // The confirm carries the reviewed draft, not a fabricated one.
    expect(payload.draft.sourceUrl).toBe("https://example.com/recipe");
  });
});
