import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { pantryApi } from "../../../api/pantry";
import { shoppingApi } from "../../../api/shopping";
import PantryScreen from "../../../../app/(tabs)/pantry";
import { makeItem } from "./pantry-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: { list: jest.fn(), refillSuggestions: jest.fn() },
}));

jest.mock("../../../api/shopping", () => ({
  shoppingApi: { addNeededItems: jest.fn(), current: jest.fn() },
}));

const mockedList = pantryApi.list as jest.MockedFunction<typeof pantryApi.list>;
const mockedRefill = pantryApi.refillSuggestions as jest.MockedFunction<
  typeof pantryApi.refillSuggestions
>;
const mockedAddNeeded = shoppingApi.addNeededItems as jest.MockedFunction<
  typeof shoppingApi.addNeededItems
>;

const ITEM = makeItem({ id: "p1", name: "nước mắm", stockState: "low" });

const LOW = {
  pantryItemId: "p1",
  name: "nước mắm",
  category: "gia vị",
  quantity: 1,
  unit: "chai",
  stockState: "low" as const,
};

describe("Pantry running-low action", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([ITEM]);
    mockedRefill.mockReset();
    mockedAddNeeded.mockReset().mockResolvedValue({
      id: "list1",
      scope: "personal",
      householdId: null,
      name: "Đi chợ",
      items: [],
      version: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    } as never);
  });

  it("adds every running-low item to the shopping list in one tap", async () => {
    // This action used to live on the home screen; it moved here with the
    // running-low list, so this is the only place that still offers it.
    mockedRefill.mockResolvedValue({ suggestions: [LOW] });

    await renderWithProviders(<PantryScreen />);

    const button = await screen.findByTestId("pantry-refill-add");
    fireEvent.press(button);

    await waitFor(() => expect(mockedAddNeeded).toHaveBeenCalledTimes(1));
    expect(mockedAddNeeded).toHaveBeenCalledWith({
      items: [expect.objectContaining({ name: "nước mắm" })],
    });
    expect(await screen.findByTestId("pantry-refill-added")).toBeTruthy();
  });

  it("hides the action when nothing is running low", async () => {
    mockedRefill.mockResolvedValue({ suggestions: [] });

    await renderWithProviders(<PantryScreen />);

    await waitFor(() => expect(mockedRefill).toHaveBeenCalled());
    expect(screen.queryByTestId("pantry-refill-add")).toBeNull();
  });
});
