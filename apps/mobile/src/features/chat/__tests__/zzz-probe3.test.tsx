import type { ReactNode } from "react";
import { act, waitFor, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChatChannel } from "../hooks";
const mockHandlers = new Map<string, (p: unknown) => void>();
jest.mock("../../../api/chat", () => ({ chatApi: { list: jest.fn(() => Promise.resolve([])) } }));
jest.mock("../../../api/chat-socket", () => ({ chatSocket: {
  connect: jest.fn(), joinHousehold: jest.fn(), leaveHousehold: jest.fn(),
  onStatus: jest.fn(() => () => undefined),
  on: jest.fn((e: string, h: (p: unknown) => void) => { mockHandlers.set(e, h); return () => mockHandlers.delete(e); }),
  markRead: jest.fn(), emitTyping: jest.fn(),
}}));
it("probe3", async () => {
  const setSpy = jest.spyOn(globalThis, "setTimeout");
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  const { unmount } = await renderHook(() => useChatChannel("h1", "me"), { wrapper });
  await waitFor(() => expect(mockHandlers.get("typing")).toBeTruthy());
  const before = setSpy.mock.calls.length;
  await act(async () => { mockHandlers.get("typing")?.({ householdId: "h1", userId: "peer" }); });
  const delays = setSpy.mock.calls.slice(before).map((c) => c[1]);
  // eslint-disable-next-line no-console
  console.log("DELAYS", JSON.stringify(delays), "total", setSpy.mock.calls.length);
  unmount();
  expect(true).toBe(true);
});
