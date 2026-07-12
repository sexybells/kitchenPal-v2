import type { ReactNode } from "react";
import { act, waitFor, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChatChannel } from "../hooks";

const TYPING_TTL_MS = 4000;
const mockHandlers = new Map<string, (payload: unknown) => void>();

jest.mock("../../../api/chat", () => ({
  chatApi: { list: jest.fn(() => Promise.resolve([])) },
}));

jest.mock("../../../api/chat-socket", () => ({
  chatSocket: {
    connect: jest.fn(),
    joinHousehold: jest.fn(),
    leaveHousehold: jest.fn(),
    onStatus: jest.fn(() => () => undefined),
    on: jest.fn((event: string, handler: (payload: unknown) => void) => {
      mockHandlers.set(event, handler);
      return () => mockHandlers.delete(event);
    }),
    markRead: jest.fn(),
    emitTyping: jest.fn(),
  },
}));

type NodeTimer = { _destroyed?: boolean };

const fireTyping = async (
  setSpy: jest.SpyInstance,
  userId: string,
): Promise<NodeTimer | undefined> => {
  await act(async () => {
    mockHandlers.get("typing")?.({ householdId: "h1", userId });
  });
  // The typing handler schedules exactly one expiry timer (delay === TTL).
  const index = setSpy.mock.calls.findIndex((call) => call[1] === TYPING_TTL_MS);
  return index >= 0 ? (setSpy.mock.results[index]!.value as NodeTimer) : undefined;
};

const isCleared = (timer: { _destroyed?: boolean } | undefined): boolean =>
  timer?._destroyed === true;

describe("chat typing timers", () => {
  beforeEach(() => {
    mockHandlers.clear();
    jest.restoreAllMocks();
  });

  it("clears the pending typing timer on unmount (no leak)", async () => {
    const setSpy = jest.spyOn(globalThis, "setTimeout");

    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = await renderHook(() => useChatChannel("h1", "me"), {
      wrapper,
    });
    await waitFor(() => expect(mockHandlers.get("typing")).toBeTruthy());

    const timer = await fireTyping(setSpy, "peer");
    // Scheduled and still live before teardown.
    expect(timer).toBeDefined();
    expect(isCleared(timer)).toBe(false);

    await act(async () => {
      unmount();
    });

    // Unmount cleanup clears the pending typing timer instead of leaking it.
    expect(isCleared(timer)).toBe(true);
  });

  it("resets a peer's timer on repeat signals rather than stacking them", async () => {
    const setSpy = jest.spyOn(globalThis, "setTimeout");

    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { unmount } = await renderHook(() => useChatChannel("h1", "me"), {
      wrapper,
    });
    await waitFor(() => expect(mockHandlers.get("typing")).toBeTruthy());

    const first = await fireTyping(setSpy, "peer");
    expect(isCleared(first)).toBe(false);

    // A repeat signal for the same peer cancels the previous timer so only one
    // stays live — a still-typing peer isn't dropped early.
    await act(async () => {
      mockHandlers.get("typing")?.({ householdId: "h1", userId: "peer" });
    });
    expect(isCleared(first)).toBe(true);

    unmount();
  });
});
