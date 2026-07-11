import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { CookResult } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { pantryApi } from "../../../api/pantry";
import CookScreen from "../../../../app/cook";
import { makeItem } from "./pantry-fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: { list: jest.fn(), cook: jest.fn() },
}));

const mockedList = pantryApi.list as jest.MockedFunction<typeof pantryApi.list>;
const mockedCook = pantryApi.cook as jest.MockedFunction<typeof pantryApi.cook>;

const cookResult: CookResult = {
  consumed: [makeItem({ id: "i1", name: "Eggs", stockState: "low", quantity: 2 })],
  unmatched: [],
  refillSuggestions: [
    {
      pantryItemId: "i1",
      name: "Eggs",
      category: "dairy",
      unit: "pcs",
      quantity: 2,
      stockState: "low",
    },
  ],
};

describe("Cook from pantry", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([
      makeItem({ id: "i1", name: "Eggs", trackingMode: "exact", quantity: 3, unit: "pcs" }),
      makeItem({ id: "i2", name: "Salt", trackingMode: "state_only", quantity: 0 }),
    ]);
    mockedCook.mockReset().mockResolvedValue(cookResult);
  });

  it("sends an idempotency key and shows the refill list", async () => {
    await renderWithProviders(<CookScreen />);

    await waitFor(() => expect(screen.getByTestId("cook-item-i1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("cook-item-i1"));
    // Selecting a tracked item reveals its quantity stepper.
    await waitFor(() => expect(screen.getByTestId("cook-qty-i1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("cook-submit"));

    await waitFor(() => expect(mockedCook).toHaveBeenCalledTimes(1));
    const input = mockedCook.mock.calls[0]![0];
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey?.length ?? 0).toBeGreaterThan(0);
    expect(input.ingredients).toEqual([
      { pantryItemId: "i1", name: "Eggs", quantity: 1, unit: "pcs" },
    ]);

    // Result view surfaces the refill suggestions returned by the cook loop.
    await waitFor(() => expect(screen.getByTestId("cook-refill")).toBeTruthy());
    expect(screen.getAllByText("Eggs").length).toBeGreaterThan(0);
  });
});
