import {
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { MessageResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { useSessionStore } from "../../../store/session";
import { chatApi } from "../../../api/chat";
import { chatSocket } from "../../../api/chat-socket";
import ChatScreen from "../../../../app/chat";
import { makeMessage, makeVoteMessage } from "./chat-fixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ householdId: "h1" }),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: [] }),
  ),
}));

jest.mock("../../../api/chat", () => ({
  chatApi: {
    list: jest.fn(),
    sendVote: jest.fn(),
    sendImage: jest.fn(),
  },
}));

jest.mock("../../../api/household", () => ({
  householdApi: { members: jest.fn(() => Promise.resolve([])) },
}));

// A mocked socket that records emits and lets tests fire server events.
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock("../../../api/chat-socket", () => ({
  chatSocket: {
    connect: jest.fn(),
    joinHousehold: jest.fn(),
    leaveHousehold: jest.fn(),
    onStatus: jest.fn((cb: (status: string) => void) => {
      cb("connected");
      return () => undefined;
    }),
    on: jest.fn((event: string, handler: (payload: unknown) => void) => {
      mockHandlers.set(event, handler);
      return () => mockHandlers.delete(event);
    }),
    sendMessage: jest.fn(() => new Promise(() => undefined)),
    castVote: jest.fn(() => new Promise(() => undefined)),
    markRead: jest.fn(),
    emitTyping: jest.fn(),
  },
}));

const fire = async (event: string, payload: unknown) =>
  act(async () => {
    mockHandlers.get(event)?.(payload);
  });

const mockedList = chatApi.list as jest.MockedFunction<typeof chatApi.list>;
const mockedCastVote = chatSocket.castVote as jest.MockedFunction<
  typeof chatSocket.castVote
>;
const mockedSend = chatSocket.sendMessage as jest.MockedFunction<
  typeof chatSocket.sendMessage
>;

describe("Chat screen", () => {
  beforeEach(() => {
    mockHandlers.clear();
    jest.clearAllMocks();
    useSessionStore.setState({
      status: "authed",
      user: {
        id: "me",
        email: "me@example.com",
        displayName: "Me",
        avatarUrl: null,
      } as never,
    });
  });

  it("renders incoming bubbles and a vote card with its tally", async () => {
    mockedList.mockResolvedValue([
      makeMessage({ id: "m1", text: "Hello household", senderId: "other-user" }),
      makeVoteMessage(),
    ]);

    await renderWithProviders(<ChatScreen />);

    await waitFor(() => expect(screen.getByTestId("chat-list")).toBeTruthy());
    expect(screen.getByText("Hello household")).toBeTruthy();
    expect(screen.getByText("What should we cook?")).toBeTruthy();
    expect(screen.getByText("Phở")).toBeTruthy();
    // Live tally: option counts + the total votes line (2 + 1 = 3).
    expect(screen.getByText("3 votes")).toBeTruthy();
  });

  it("emits castVote when an option is tapped", async () => {
    mockedList.mockResolvedValue([makeVoteMessage()]);

    await renderWithProviders(<ChatScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("message-vote1-option-opt-pho")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("message-vote1-option-opt-pho"));

    expect(mockedCastVote).toHaveBeenCalledWith("h1", "vote1", "opt-pho");
  });

  it("reconciles an optimistic send when the server message echoes back", async () => {
    mockedList.mockResolvedValue([]);

    await renderWithProviders(<ChatScreen />);

    // Wait for the empty history to settle before composing.
    await waitFor(() => expect(screen.getByTestId("chat-input-field")).toBeTruthy());
    await waitFor(() =>
      expect(
        screen.getByText("No messages yet. Start the conversation!"),
      ).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("chat-input-field"), "Dinner soon");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("chat-input-send"));
    });

    expect(mockedSend).toHaveBeenCalledWith("h1", "Dinner soon");
    // Optimistic bubble shows immediately, still sending.
    await waitFor(() => expect(screen.getByText("Dinner soon")).toBeTruthy());

    // The server broadcasts the confirmed message (same sender + text).
    const confirmed: MessageResponse = makeMessage({
      id: "server-1",
      senderId: "me",
      text: "Dinner soon",
      readByUserIds: ["me"],
      createdAt: "2026-07-12T10:00:00.000Z",
    });
    await fire("message", confirmed);

    // Reconciled: a single bubble, no longer in the "sending" state.
    await waitFor(() =>
      expect(screen.getAllByText("Dinner soon")).toHaveLength(1),
    );
    expect(screen.queryByText("Sending…")).toBeNull();
  });
});
