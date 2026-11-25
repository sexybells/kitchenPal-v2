import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { getCalendars } from "expo-localization";
import type { UserSettingsResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { usersApi } from "../../../api/users";
import { useSessionStore } from "../../../store/session";
import SettingsScreen from "../../../../app/settings";
import { useTimeZoneSync } from "../hooks";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-US" }],
  getCalendars: jest.fn(),
}));

jest.mock("../../../api/users", () => ({
  usersApi: {
    registerPushToken: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

jest.mock("../../subscription/hooks", () => ({
  useMySubscription: () => ({ data: { tier: "free" } }),
}));

const makeSettings = (
  overrides: Partial<UserSettingsResponse> = {},
): UserSettingsResponse => ({
  locale: "en",
  measurementSystem: "metric",
  theme: "system",
  notifications: {
    push: true,
    email: true,
    mealReminders: true,
    shoppingReminders: true,
  },
  biometricLockEnabled: false,
  observesVegetarianDays: false,
  timeZone: "Asia/Ho_Chi_Minh",
  ...overrides,
});

const mockedGet = usersApi.getSettings as jest.MockedFunction<
  typeof usersApi.getSettings
>;
const mockedUpdate = usersApi.updateSettings as jest.MockedFunction<
  typeof usersApi.updateSettings
>;
const mockedCalendars = getCalendars as jest.MockedFunction<typeof getCalendars>;

function TimeZoneProbe() {
  useTimeZoneSync();
  return null;
}

describe("Settings notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ status: "authed" });
    mockedGet.mockResolvedValue(makeSettings());
    mockedUpdate.mockResolvedValue(makeSettings());
  });

  it("toggling the vegetarian row updates observesVegetarianDays", async () => {
    await renderWithProviders(<SettingsScreen />);
    const toggle = await screen.findByTestId("settings-vegetarian-toggle");
    await waitFor(() => expect(toggle.props.disabled).not.toBe(true));

    await act(async () => {
      fireEvent(toggle, "valueChange", true);
    });

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ observesVegetarianDays: true }),
    );
  });

  it("toggling meal reminders updates notifications.mealReminders", async () => {
    await renderWithProviders(<SettingsScreen />);
    const toggle = await screen.findByTestId("settings-meal-reminders-toggle");
    await waitFor(() => expect(toggle.props.disabled).not.toBe(true));

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({
        notifications: { mealReminders: false },
      }),
    );
  });
});

describe("useTimeZoneSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ status: "authed" });
    mockedCalendars.mockReturnValue([
      { timeZone: "Asia/Ho_Chi_Minh" },
    ] as unknown as ReturnType<typeof getCalendars>);
  });

  it("does not PATCH when the server already has the device zone", async () => {
    mockedGet.mockResolvedValue(makeSettings({ timeZone: "Asia/Ho_Chi_Minh" }));
    await renderWithProviders(<TimeZoneProbe />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("PATCHes the device zone when the server differs", async () => {
    mockedGet.mockResolvedValue(makeSettings({ timeZone: "Europe/Berlin" }));
    mockedUpdate.mockResolvedValue(makeSettings());
    await renderWithProviders(<TimeZoneProbe />);
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ timeZone: "Asia/Ho_Chi_Minh" }),
    );
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
  });

  it("does nothing for guests", async () => {
    useSessionStore.setState({ status: "guest" });
    await renderWithProviders(<TimeZoneProbe />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
