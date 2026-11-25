import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { NotificationResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { notificationsApi } from "../../../api/notifications";
import { usersApi } from "../../../api/users";
import NotificationsScreen from "../../../../app/notifications";
import { registerPushToken, routeForPushResponse } from "../push";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../../api/notifications", () => ({
  notificationsApi: { list: jest.fn(), markRead: jest.fn() },
}));

jest.mock("../../../api/users", () => ({
  usersApi: { registerPushToken: jest.fn() },
}));

// The shared socket is not exercised here; stub the stream wiring.
jest.mock("../../../api/chat-socket", () => ({
  chatSocket: { connect: jest.fn(), on: jest.fn(() => () => undefined) },
}));

const makeNotification = (
  overrides: Partial<NotificationResponse> = {},
): NotificationResponse => ({
  id: "n1",
  type: "chat_message",
  payload: { preview: "Dinner at 7?" },
  readAt: null,
  createdAt: "2026-07-12T09:00:00.000Z",
  ...overrides,
});

const mockedList = notificationsApi.list as jest.MockedFunction<
  typeof notificationsApi.list
>;
const mockedMarkRead = notificationsApi.markRead as jest.MockedFunction<
  typeof notificationsApi.markRead
>;

describe("Notifications screen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders grouped new/earlier with an unread indicator", async () => {
    mockedList.mockResolvedValue([
      makeNotification({ id: "n1", readAt: null, payload: { preview: "Dinner at 7?" } }),
      makeNotification({
        id: "n2",
        type: "budget_alert",
        readAt: "2026-07-12T08:00:00.000Z",
        payload: { preview: "Over budget" },
      }),
    ]);

    await renderWithProviders(<NotificationsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("notification-n1")).toBeTruthy(),
    );
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
    // The unread row carries the unread dot; the read one does not.
    expect(screen.getByTestId("notification-n1-unread")).toBeTruthy();
    expect(screen.queryByTestId("notification-n2-unread")).toBeNull();
  });

  it("marks a notification read and deep-links on tap", async () => {
    mockedList.mockResolvedValue([
      makeNotification({ id: "n1", type: "chat_message", payload: { householdId: "h1" } }),
    ]);
    mockedMarkRead.mockResolvedValue(makeNotification({ id: "n1", readAt: "x" }));

    await renderWithProviders(<NotificationsScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("notification-n1")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("notification-n1"));

    await waitFor(() => expect(mockedMarkRead).toHaveBeenCalledWith("n1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/chat",
      params: { householdId: "h1" },
    });
  });
});

describe("push registration", () => {
  const Device = jest.requireMock("expo-device") as { isDevice: boolean };
  const Notifications = jest.requireMock("expo-notifications") as {
    getPermissionsAsync: jest.Mock;
    getExpoPushTokenAsync: jest.Mock;
  };
  const Constants = (jest.requireMock("expo-constants") as { default: unknown })
    .default as { expoConfig: { extra: Record<string, unknown> } };

  beforeEach(() => jest.clearAllMocks());

  it("posts the Expo token when push is available", async () => {
    Device.isDevice = true;
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({
      data: "ExponentPushToken[abc]",
    });
    Constants.expoConfig.extra = { eas: { projectId: "proj-1" } };

    const token = await registerPushToken();

    expect(token).toBe("ExponentPushToken[abc]");
    expect(usersApi.registerPushToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: "ExponentPushToken[abc]" }),
    );
  });

  it("no-ops (no post) on a simulator", async () => {
    Device.isDevice = false;
    const token = await registerPushToken();
    expect(token).toBeNull();
    expect(usersApi.registerPushToken).not.toHaveBeenCalled();
  });
});

describe("push tap routing", () => {
  const tap = (data: Record<string, unknown>) =>
    routeForPushResponse({
      notification: { request: { content: { data } } },
    } as unknown as Parameters<typeof routeForPushResponse>[0]);

  it("routes chat pushes from the real { type, ...payload } shape", () => {
    expect(tap({ type: "chat_message", householdId: "h1" })).toEqual({
      pathname: "/chat",
      params: { householdId: "h1" },
    });
  });

  it("opens the rescue recipe for an expiry alert that carries one", () => {
    expect(tap({ type: "expiry_alert", recipeId: "r1" })).toBe("/recipe?id=r1");
  });

  it("falls back to the pantry for an expiry alert without a recipe", () => {
    expect(tap({ type: "expiry_alert" })).toBe("/pantry");
  });

  it("opens home for a vegetarian-day push", () => {
    expect(tap({ type: "vegetarian_day" })).toBe("/");
  });

  it("ignores an unknown type", () => {
    expect(tap({ type: "bogus" })).toBeNull();
  });
});
