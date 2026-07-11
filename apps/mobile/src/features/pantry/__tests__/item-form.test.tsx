import type { ReactNode } from "react";
import { fireEvent, screen, waitFor, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { pantryApi } from "../../../api/pantry";
import { useDeleteItem, pantryKeys } from "../hooks";
import PantryItemScreen from "../../../../app/pantry-item";
import { makeItem } from "./pantry-fixtures";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("../../../api/pantry", () => ({
  pantryApi: {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

const mockedCreate = pantryApi.create as jest.MockedFunction<typeof pantryApi.create>;
const mockedRemove = pantryApi.remove as jest.MockedFunction<typeof pantryApi.remove>;

describe("Item form — create", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockedCreate.mockReset().mockResolvedValue(makeItem());
  });

  it("submits the entered fields as the create payload", async () => {
    await renderWithProviders(<PantryItemScreen />);

    fireEvent.changeText(screen.getByTestId("item-name"), "Carrots");
    // findBy flushes the controlled-input state so the submit button enables.
    fireEvent.press(await screen.findByTestId("item-submit"));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    const payload = mockedCreate.mock.calls[0]![0];
    // Default tracking is state_only → assistive stock level, no quantity sent.
    expect(payload).toMatchObject({
      name: "Carrots",
      category: "produce",
      stockState: "plenty",
      trackingMode: "state_only",
    });
    expect(payload.quantity).toBeUndefined();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe("Delete item — optimistic", () => {
  it("removes the item from the cached list before the request resolves", async () => {
    const client = new QueryClient();
    client.setQueryData(pantryKeys.items({}), [
      makeItem({ id: "gone" }),
      makeItem({ id: "keep" }),
    ]);

    let resolve!: () => void;
    mockedRemove.mockReset().mockReturnValue(
      new Promise<void>((r) => {
        resolve = () => r();
      }),
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    // RNTL render is async under React's concurrent renderer — await the hook.
    const { result } = await renderHook(() => useDeleteItem(), { wrapper });

    await waitFor(() => expect(result.current).toBeTruthy());
    result.current.mutate("gone");

    // The optimistic cache update happens in onMutate, before the request settles.
    await waitFor(() => {
      const cached = client.getQueryData(pantryKeys.items({})) as
        | { id: string }[]
        | undefined;
      expect(cached?.map((entry) => entry.id)).toEqual(["keep"]);
    });

    resolve();
  });
});
