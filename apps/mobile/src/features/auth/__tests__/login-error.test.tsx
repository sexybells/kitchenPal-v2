import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { ApiClientError } from "../../../api/errors";
import { useSessionStore } from "../../../store/session";
import { authApi } from "../../../api/auth";
import LoginScreen from "../../../../app/(auth)/login";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
}));

jest.mock("../../../api/auth", () => ({
  authApi: { login: jest.fn() },
}));

const mockedLogin = authApi.login as jest.MockedFunction<typeof authApi.login>;

describe("Login flow — failure", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
    useSessionStore.setState({
      status: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  });

  it("shows an error message and stays a guest on invalid credentials", async () => {
    mockedLogin.mockRejectedValue(
      new ApiClientError({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
        status: 401,
      }),
    );
    await renderWithProviders(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId("login-email"), "chef@kitchenpal.app");
    fireEvent.changeText(screen.getByTestId("login-password"), "wrongpass");
    fireEvent.press(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeTruthy();
    });
    // Rendered message is localized from the error code, not the raw server text.
    expect(screen.getByText("Email or password is incorrect.")).toBeTruthy();
    expect(useSessionStore.getState().status).toBe("guest");
  });
});
