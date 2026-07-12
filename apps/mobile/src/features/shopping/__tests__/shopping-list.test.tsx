import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { shoppingApi } from "../../../api/shopping";
import { mealPlansApi } from "../../../api/recipes";
import { ApiClientError } from "../../../api/errors";
import ShoppingScreen from "../../../../app/(tabs)/shopping";
import { makeItem, makeList } from "./shopping-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/shopping", () => ({
  shoppingApi: {
    current: jest.fn(),
    getById: jest.fn(),
    generate: jest.fn(),
    addNeededItems: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
  },
}));

// The screen also reads the current meal plan (to offer generate-from-plan).
jest.mock("../../../api/recipes", () => ({
  mealPlansApi: { current: jest.fn() },
  recipesApi: {},
}));

const mockedCurrent = shoppingApi.current as jest.MockedFunction<typeof shoppingApi.current>;
const mockedUpdate = shoppingApi.updateItem as jest.MockedFunction<typeof shoppingApi.updateItem>;
const mockedPlan = mealPlansApi.current as jest.MockedFunction<typeof mealPlansApi.current>;

describe("ShoppingScreen", () => {
  beforeEach(() => {
    mockedCurrent.mockReset();
    mockedUpdate.mockReset();
    mockedPlan.mockReset().mockRejectedValue(
      new ApiClientError({ code: "NOT_FOUND", message: "no plan", status: 404 }),
    );
  });

  it("renders items grouped by category with a source tag", async () => {
    mockedCurrent.mockResolvedValue(
      makeList({
        version: 1,
        items: [
          makeItem({ id: "a", name: "Cà chua", category: "produce" }),
          makeItem({ id: "b", name: "Thịt bò", category: "meat", sourceRecipeId: "r1" }),
        ],
      }),
    );

    await renderWithProviders(<ShoppingScreen />);

    await waitFor(() => expect(screen.getByTestId("shopping-item-a")).toBeTruthy());
    expect(screen.getByText("Cà chua")).toBeTruthy();
    expect(screen.getByText("Thịt bò")).toBeTruthy();
    // The recipe-sourced line shows the source tag (badge upper-cases it; tests run
    // under the English bundle).
    expect(screen.getByText("FROM RECIPE")).toBeTruthy();
  });

  it("toggles bought optimistically and sends the guarded expectedVersion", async () => {
    mockedCurrent.mockResolvedValue(
      makeList({ version: 4, items: [makeItem({ id: "a", name: "Cà chua" })] }),
    );
    mockedUpdate.mockResolvedValue(
      makeList({ version: 5, items: [makeItem({ id: "a", name: "Cà chua", bought: true })] }),
    );

    await renderWithProviders(<ShoppingScreen />);
    await waitFor(() => expect(screen.getByTestId("shopping-item-a-toggle")).toBeTruthy());

    fireEvent.press(screen.getByTestId("shopping-item-a-toggle"));

    // Optimistic: the checkbox reports checked before the request resolves.
    await waitFor(() =>
      expect(
        screen.getByTestId("shopping-item-a-toggle").props.accessibilityState.checked,
      ).toBe(true),
    );
    expect(mockedUpdate).toHaveBeenCalledWith("list1", "a", {
      bought: true,
      expectedVersion: 4,
    });
  });

  it("rolls back and refetches the list when a stale toggle 409s", async () => {
    mockedCurrent.mockResolvedValue(
      makeList({ version: 4, items: [makeItem({ id: "a", name: "Cà chua" })] }),
    );
    mockedUpdate.mockRejectedValue(
      new ApiClientError({ code: "OPTIMISTIC_LOCK_CONFLICT", message: "stale", status: 409 }),
    );

    await renderWithProviders(<ShoppingScreen />);
    await waitFor(() => expect(screen.getByTestId("shopping-item-a-toggle")).toBeTruthy());

    fireEvent.press(screen.getByTestId("shopping-item-a-toggle"));

    // The 409 rolls the optimistic flip back and refetches to reconcile version.
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByTestId("shopping-item-a-toggle").props.accessibilityState.checked,
      ).toBe(false),
    );
    expect(mockedCurrent.mock.calls.length).toBeGreaterThan(1);
  });
});
