import { ApiClient, type SessionBridge } from "../client";
import { ApiClientError } from "../errors";

const BASE = "http://localhost:3001";

const tokenPair = (suffix: string) => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  expiresIn: 900,
});

const makeResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const successEnvelope = (data: unknown) =>
  makeResponse(200, { data, meta: { requestId: "req-test" } });

const unauthorized = () =>
  makeResponse(401, {
    error: { code: "UNAUTHENTICATED", message: "nope" },
    meta: { requestId: "r" },
  });

interface Bridge extends SessionBridge {
  getAccessToken: jest.Mock;
  getRefreshToken: jest.Mock;
  onTokensRotated: jest.Mock;
  onAuthFailure: jest.Mock;
}

const createBridge = (): Bridge => {
  let accessToken: string | null = "access-stale";
  let refreshToken: string | null = "refresh-0";
  return {
    getAccessToken: jest.fn(() => accessToken),
    getRefreshToken: jest.fn(() => refreshToken),
    onTokensRotated: jest.fn((tokens: { accessToken: string; refreshToken: string }) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    }),
    onAuthFailure: jest.fn(() => {
      accessToken = null;
      refreshToken = null;
    }),
  };
};

const refreshCallCount = (fetchImpl: jest.Mock): number =>
  fetchImpl.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith("/auth/refresh")).length;

describe("ApiClient token refresh", () => {
  it("rotates the token on a 401 and retries the original request once", async () => {
    const fetchImpl: jest.Mock = jest.fn(async (url: string): Promise<Response> => {
      if (url.endsWith("/auth/refresh")) return successEnvelope(tokenPair("rotated"));
      const protectedCalls = fetchImpl.mock.calls.filter((c: unknown[]) =>
        String(c[0]).endsWith("/protected"),
      ).length;
      // The first protected call is unauthorized; the retry succeeds.
      return protectedCalls > 1 ? successEnvelope({ ok: true }) : unauthorized();
    });
    const bridge = createBridge();
    const client = new ApiClient({ baseUrl: BASE, session: bridge, fetchImpl });

    const result = await client.request("protected", { auth: true });

    expect(result).toEqual({ ok: true });
    expect(bridge.onTokensRotated).toHaveBeenCalledTimes(1);
    expect(bridge.onTokensRotated).toHaveBeenCalledWith(tokenPair("rotated"));
    expect(bridge.onAuthFailure).not.toHaveBeenCalled();
    expect(refreshCallCount(fetchImpl)).toBe(1);
  });

  it("signs the user out when the refresh call fails", async () => {
    const fetchImpl: jest.Mock = jest.fn(async (url: string): Promise<Response> => {
      if (url.endsWith("/auth/refresh")) {
        return makeResponse(401, {
          error: { code: "TOKEN_EXPIRED", message: "expired" },
          meta: { requestId: "r" },
        });
      }
      return unauthorized();
    });
    const bridge = createBridge();
    const client = new ApiClient({ baseUrl: BASE, session: bridge, fetchImpl });

    await expect(client.request("protected", { auth: true })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(bridge.onAuthFailure).toHaveBeenCalledTimes(1);
    expect(bridge.onTokensRotated).not.toHaveBeenCalled();
  });

  it("refreshes once for concurrent 401s (single-flight)", async () => {
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const protectedState = new Map<string, number>();

    const fetchImpl: jest.Mock = jest.fn(async (url: string): Promise<Response> => {
      if (url.endsWith("/auth/refresh")) {
        await refreshGate; // hold until both protected 401s have landed
        return successEnvelope(tokenPair("rotated"));
      }
      const seen = protectedState.get(url) ?? 0;
      protectedState.set(url, seen + 1);
      return seen === 0 ? unauthorized() : successEnvelope({ path: url });
    });
    const bridge = createBridge();
    const client = new ApiClient({ baseUrl: BASE, session: bridge, fetchImpl });

    const first = client.request("a", { auth: true });
    const second = client.request("b", { auth: true });
    // Let both initial 401s resolve and enter the single-flight refresh guard.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh();

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ path: `${BASE}/a` });
    expect(b).toEqual({ path: `${BASE}/b` });
    expect(refreshCallCount(fetchImpl)).toBe(1);
    expect(bridge.onTokensRotated).toHaveBeenCalledTimes(1);
  });

  it("signs out when the retry after a refresh still returns 401", async () => {
    const fetchImpl: jest.Mock = jest.fn(async (url: string): Promise<Response> => {
      if (url.endsWith("/auth/refresh")) return successEnvelope(tokenPair("rotated"));
      // The rotated token is still rejected — the session is truly invalid.
      return unauthorized();
    });
    const bridge = createBridge();
    const client = new ApiClient({ baseUrl: BASE, session: bridge, fetchImpl });

    await expect(client.request("protected", { auth: true })).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(bridge.onTokensRotated).toHaveBeenCalledTimes(1);
    expect(bridge.onAuthFailure).toHaveBeenCalledTimes(1);
  });
});
