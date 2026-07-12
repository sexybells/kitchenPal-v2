import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { spendingApi } from "../../../api/spending";
import { ApiClientError } from "../../../api/errors";
import BudgetScreen from "../../../../app/budget";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/spending", () => ({
  spendingApi: { currentBudget: jest.fn(), createBudget: jest.fn() },
}));

const mockedCurrent = spendingApi.currentBudget as jest.MockedFunction<
  typeof spendingApi.currentBudget
>;
const mockedCreate = spendingApi.createBudget as jest.MockedFunction<
  typeof spendingApi.createBudget
>;

describe("BudgetScreen overlap handling", () => {
  beforeEach(() => {
    // No active budget yet -> the create form is shown.
    mockedCurrent.mockReset().mockRejectedValue(
      new ApiClientError({ code: "NOT_FOUND", message: "no budget", status: 404 }),
    );
    mockedCreate.mockReset();
  });

  it("surfaces a localized error when the new cycle overlaps an existing one (409)", async () => {
    mockedCreate.mockRejectedValue(
      new ApiClientError({ code: "CONFLICT", message: "overlap", status: 409 }),
    );

    await renderWithProviders(<BudgetScreen />);

    await waitFor(() => expect(screen.getByTestId("budget-amount")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("budget-amount"), "3000000");
    // `findBy` flushes the controlled-input state so the save button enables.
    fireEvent.press(await screen.findByTestId("budget-save"));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith({ amount: 3000000 }));
    // The 409 maps to the overlap copy, not a raw server message.
    await waitFor(() =>
      expect(
        screen.getByText(
          "A budget already covers this period. Wait for the current cycle to end.",
        ),
      ).toBeTruthy(),
    );
  });
});
