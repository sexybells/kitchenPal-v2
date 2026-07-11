import { authApi } from "../../api/auth";
import { useSessionStore } from "../session";

// Mock the auth API so sign-out doesn't load the real network client.
jest.mock("../../api/auth", () => ({
  authApi: { logout: jest.fn().mockResolvedValue(undefined) },
}));

const mockedLogout = authApi.logout as jest.MockedFunction<typeof authApi.logout>;

describe("session signOut", () => {
  beforeEach(() => {
    mockedLogout.mockClear();
    mockedLogout.mockResolvedValue(undefined);
    useSessionStore.setState({
      status: "authed",
      user: null,
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
  });

  it("revokes the refresh-token family server-side, then clears local state", async () => {
    await useSessionStore.getState().signOut();

    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(mockedLogout).toHaveBeenCalledWith("refresh-1");
    const state = useSessionStore.getState();
    expect(state.status).toBe("guest");
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
  });

  it("still signs out locally when the revoke call fails (offline)", async () => {
    mockedLogout.mockRejectedValueOnce(new Error("offline"));

    await expect(useSessionStore.getState().signOut()).resolves.toBeUndefined();
    expect(useSessionStore.getState().status).toBe("guest");
    expect(useSessionStore.getState().refreshToken).toBeNull();
  });

  it("skips the revoke call when there is no refresh token", async () => {
    useSessionStore.setState({ refreshToken: null });
    await useSessionStore.getState().signOut();
    expect(mockedLogout).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("guest");
  });
});
