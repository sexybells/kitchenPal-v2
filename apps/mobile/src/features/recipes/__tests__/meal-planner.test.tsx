import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { mealPlansApi, recipesApi } from "../../../api/recipes";
import { ApiClientError } from "../../../api/errors";
import { MealPlanner } from "../MealPlanner";
import { makeMealPlan, makeSlot } from "./recipe-fixtures";

// The `src/ui` barrel pulls in BottomNav (expo-router); mock it so the suite
// doesn't load expo-router's untransformed ESM tree.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../../api/recipes", () => ({
  recipesApi: { list: jest.fn() },
  mealPlansApi: {
    current: jest.fn(),
    create: jest.fn(),
    updateSlot: jest.fn(),
    autoFill: jest.fn(),
  },
}));

const mockedCurrent = mealPlansApi.current as jest.MockedFunction<
  typeof mealPlansApi.current
>;
const mockedUpdateSlot = mealPlansApi.updateSlot as jest.MockedFunction<
  typeof mealPlansApi.updateSlot
>;
const mockedAutoFill = mealPlansApi.autoFill as jest.MockedFunction<
  typeof mealPlansApi.autoFill
>;
const mockedList = recipesApi.list as jest.MockedFunction<typeof recipesApi.list>;

describe("MealPlanner", () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedUpdateSlot.mockReset();
    mockedAutoFill.mockReset();
  });

  it("auto-fills empty slots and renders the filled recipe", async () => {
    const emptyPlan = makeMealPlan({ slots: [makeSlot({ id: "s1" })] });
    const filledPlan = makeMealPlan({
      slots: [makeSlot({ id: "s1", recipeId: "rX", recipeName: "Phở bò" })],
      version: 4,
    });
    mockedCurrent.mockReset().mockResolvedValue(emptyPlan);
    mockedAutoFill.mockResolvedValue({
      plan: filledPlan,
      filledSlotIds: ["s1"],
      provider: "openai",
      degraded: false,
      needsManual: false,
    });

    await renderWithProviders(<MealPlanner onOpenRecipe={jest.fn()} />);

    await waitFor(() => expect(screen.getByTestId("planner-slot-s1-add")).toBeTruthy());
    fireEvent.press(screen.getByTestId("planner-autofill"));

    await waitFor(() =>
      expect(screen.getByTestId("planner-slot-s1-filled")).toBeTruthy(),
    );
    expect(screen.getByText("Phở bò")).toBeTruthy();
  });

  it("sends expectedVersion on a slot edit and handles a 409 conflict", async () => {
    const plan = makeMealPlan({
      version: 3,
      slots: [makeSlot({ id: "s1", recipeId: "rX", recipeName: "Phở bò" })],
    });
    mockedCurrent.mockReset().mockResolvedValue(plan);
    mockedUpdateSlot.mockRejectedValue(
      new ApiClientError({ code: "OPTIMISTIC_LOCK_CONFLICT", message: "stale", status: 409 }),
    );

    await renderWithProviders(<MealPlanner onOpenRecipe={jest.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId("planner-slot-s1-clear")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("planner-slot-s1-clear"));

    await waitFor(() => expect(mockedUpdateSlot).toHaveBeenCalledTimes(1));
    expect(mockedUpdateSlot).toHaveBeenCalledWith("plan1", "s1", {
      recipeId: null,
      expectedVersion: 3,
    });

    // 409 surfaces a conflict banner and refetches the plan.
    await waitFor(() => expect(screen.getByTestId("planner-conflict")).toBeTruthy());
    expect(mockedCurrent.mock.calls.length).toBeGreaterThan(1);
  });
});
