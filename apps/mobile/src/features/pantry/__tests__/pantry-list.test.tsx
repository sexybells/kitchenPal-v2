import { screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { pantryApi } from "../../../api/pantry";
import { ApiClientError } from "../../../api/errors";
import PantryScreen from "../../../../app/(tabs)/pantry";
import { makeItem } from "./pantry-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: { list: jest.fn() },
}));

const mockedList = pantryApi.list as jest.MockedFunction<typeof pantryApi.list>;

describe("Pantry list", () => {
  beforeEach(() => mockedList.mockReset());

  it("renders items grouped by category with stock pills", async () => {
    mockedList.mockResolvedValue([
      makeItem({ id: "a", name: "Eggs", category: "dairy", stockState: "plenty" }),
      makeItem({ id: "b", name: "Milk", category: "dairy", stockState: "low" }),
      makeItem({ id: "c", name: "Spinach", category: "produce", stockState: "some" }),
    ]);

    await renderWithProviders(<PantryScreen />);

    await waitFor(() => expect(screen.getByTestId("pantry-list")).toBeTruthy());
    expect(screen.getByText("Eggs")).toBeTruthy();
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("Spinach")).toBeTruthy();
    // Category labels appear as both a filter chip and a group header.
    expect(screen.getAllByText("Dairy & eggs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Produce").length).toBeGreaterThan(0);
    // Stock pills render their localized, upper-cased labels.
    expect(screen.getByTestId("pantry-item-b-stock")).toBeTruthy();
    expect(screen.getByText("LOW")).toBeTruthy();
  });

  it("shows the empty state when there are no items", async () => {
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<PantryScreen />);
    await waitFor(() => expect(screen.getByTestId("pantry-empty")).toBeTruthy());
  });

  it("shows the error state with a retry when the list fails", async () => {
    // A 400 is not retried by the query client, so the error state is immediate.
    mockedList.mockRejectedValue(
      new ApiClientError({ code: "HTTP_ERROR", message: "boom", status: 400 }),
    );
    await renderWithProviders(<PantryScreen />);
    await waitFor(() => expect(screen.getByTestId("pantry-error")).toBeTruthy());
  });
});
