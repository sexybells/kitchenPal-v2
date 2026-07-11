import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { AuthResult } from "@kitchenpal/api-contract";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { useSessionStore } from "../../../store/session";
import { authApi } from "../../../api/auth";
import LoginScreen from "../../../../app/(auth)/login";

// Route hooks need a navigation context we don't mount in unit tests. The
// redirect to the tabs on success is covered by auth-routing.test.ts.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
}));

// The API client is mocked — this exercises the screen + session wiring only.
jest.mock("../../../api/auth", () => ({
  authApi: { login: jest.fn() },
}));

const mockedLogin = authApi.login as jest.MockedFunction<typeof authApi.login>;

const authResult: AuthResult = {
  user: {
    id: "u1",
    email: "chef@kitchenpal.app",
    phone: null,
    displayName: "Chef",
    avatarUrl: null,
    roles: ["user"],
    locale: "en",
    emailVerified: true,
    phoneVerified: false,
    activeHouseholdId: null,
    createdAt: new Date().toISOString(),
  },
  tokens: { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900 },
};

describe("Login flow — success", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
    useSessionStore.setState({
      status: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  });

  it("establishes a session and stores tokens on success", async () => {
    mockedLogin.mockResolvedValue(authResult);
    await renderWithProviders(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId("login-email"), "chef@kitchenpal.app");
    fireEvent.changeText(screen.getByTestId("login-password"), "password123");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe("authed");
    });
    const state = useSessionStore.getState();
    expect(state.accessToken).toBe("access-1");
    expect(state.refreshToken).toBe("refresh-1");
    expect(state.user?.displayName).toBe("Chef");
  });
});
