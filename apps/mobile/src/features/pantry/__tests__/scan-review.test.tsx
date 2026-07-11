import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { pantryApi } from "../../../api/pantry";
import ScanReviewScreen from "../../../../app/scan-review";
import { makeScan, makeDetection } from "./pantry-fixtures";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ scanId: "scan-1" }),
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: { getScan: jest.fn(), confirmScan: jest.fn() },
}));

const mockedGetScan = pantryApi.getScan as jest.MockedFunction<typeof pantryApi.getScan>;
const mockedConfirm = pantryApi.confirmScan as jest.MockedFunction<
  typeof pantryApi.confirmScan
>;

describe("Scan review", () => {
  beforeEach(() => {
    mockedGetScan.mockReset();
    mockedConfirm.mockReset().mockResolvedValue(undefined);
    mockReplace.mockReset();
  });

  it("confirms the edited detection set (bumped quantity)", async () => {
    mockedGetScan.mockResolvedValue(
      makeScan({ detections: [makeDetection({ name: "Tomato", quantity: 2, unit: "pcs" })] }),
    );

    await renderWithProviders(<ScanReviewScreen />);

    // Wait for the detection row to seed from the ready scan (name is an input).
    await waitFor(() => expect(screen.getByLabelText("increment")).toBeTruthy());
    expect(screen.getByDisplayValue("Tomato")).toBeTruthy();

    // Bump the quantity 2 → 3 via the stepper, then confirm.
    fireEvent.press(screen.getByLabelText("increment"));
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    fireEvent.press(screen.getByTestId("review-confirm"));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(1));
    const [scanId, input] = mockedConfirm.mock.calls[0]!;
    expect(scanId).toBe("scan-1");
    expect(input.items).toHaveLength(1);
    expect(input.items[0]).toMatchObject({
      name: "Tomato",
      quantity: 3,
      trackingMode: "exact",
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/pantry"));
  });

  it("guides to manual entry on the degrade path (no detections)", async () => {
    mockedGetScan.mockResolvedValue(
      makeScan({ degraded: true, provider: "none", detections: [] }),
    );

    await renderWithProviders(<ScanReviewScreen />);

    await waitFor(() => expect(screen.getByTestId("scan-degraded")).toBeTruthy());
    // Confirm is disabled while there are no items.
    expect(screen.getByTestId("review-confirm").props.accessibilityState.disabled).toBe(
      true,
    );

    // Adding a manual row opens an editable entry (manual "add missing").
    fireEvent.press(screen.getByTestId("review-add"));
    expect(await screen.findByPlaceholderText("e.g. Eggs")).toBeTruthy();
  });
});
