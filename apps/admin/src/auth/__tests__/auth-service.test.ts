import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResult, Role } from "@kitchenpal/api-contract";

// Mock the wired API client so the auth service is tested in isolation.
// `vi.hoisted` keeps the mock fn available to the hoisted `vi.mock` factory.
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/api/api", () => ({ api: { request } }));

import { loginAsAdmin, logout, NOT_ADMIN_CODE } from "../auth-service";
import { sessionStore } from "../session-store";
import { ApiClientError } from "@/api/errors";

function authResult(roles: Role[]): AuthResult {
  return {
    user: {
      id: "u1",
      email: "admin@example.com",
      phone: null,
      displayName: "Admin",
      avatarUrl: null,
      roles,
      locale: "en",
      emailVerified: true,
      phoneVerified: false,
      activeHouseholdId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    tokens: {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 600,
    },
  };
}

beforeEach(() => {
  request.mockReset();
  sessionStore.clear();
});

afterEach(() => {
  sessionStore.clear();
});

describe("loginAsAdmin", () => {
  it("establishes a session for an admin account", async () => {
    request.mockResolvedValueOnce(authResult(["user", "admin"]));

    const result = await loginAsAdmin({
      email: "admin@example.com",
      password: "password123",
    });

    expect(result.user.roles).toContain("admin");
    expect(sessionStore.getState().accessToken).toBe("access-token");
    expect(sessionStore.getState().user?.id).toBe("u1");
  });

  it("rejects a non-admin account and leaves no session", async () => {
    // First call: successful login as a normal user. Second call: revoke.
    request
      .mockResolvedValueOnce(authResult(["user"]))
      .mockResolvedValueOnce(undefined);

    await expect(
      loginAsAdmin({ email: "user@example.com", password: "password123" }),
    ).rejects.toMatchObject({ code: NOT_ADMIN_CODE });

    // The just-issued refresh token is revoked (logout call) and no session set.
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(
      "auth/logout",
      expect.objectContaining({
        body: { refreshToken: "refresh-token" },
      }),
    );
    expect(sessionStore.getState().accessToken).toBeNull();
    expect(sessionStore.getState().user).toBeNull();
  });

  it("surfaces the ApiClientError type for the console to branch on", async () => {
    request.mockResolvedValueOnce(authResult(["user"]));
    request.mockResolvedValueOnce(undefined);

    await expect(
      loginAsAdmin({ email: "user@example.com", password: "password123" }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe("logout", () => {
  it("revokes the refresh token and clears the session", async () => {
    request.mockResolvedValueOnce(authResult(["user", "admin"]));
    await loginAsAdmin({ email: "admin@example.com", password: "password123" });
    request.mockResolvedValueOnce(undefined);

    await logout();

    expect(sessionStore.getState().accessToken).toBeNull();
    expect(sessionStore.getState().user).toBeNull();
  });
});
