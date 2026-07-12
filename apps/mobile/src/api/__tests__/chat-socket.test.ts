import type { Socket } from "socket.io-client";
import { ChatSocket, type SocketFactory } from "../socket";

/** A minimal in-memory socket that records emits and replays handlers. */
function createFakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emit = jest.fn();
  const disconnect = jest.fn();
  const removeAllListeners = jest.fn();
  const socket = {
    connected: true,
    on: jest.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    }),
    off: jest.fn(),
    emit,
    disconnect,
    removeAllListeners,
    io: { on: jest.fn() },
  };
  return {
    socket: socket as unknown as Socket,
    emit,
    disconnect,
    removeAllListeners,
    fire: (event: string, payload?: unknown) => handlers.get(event)?.(payload),
  };
}

describe("ChatSocket", () => {
  const HOUSEHOLD = "household-1";

  it("authenticates the handshake with the current access token", () => {
    const fake = createFakeSocket();
    const factory: SocketFactory = jest.fn(() => fake.socket);
    const socket = new ChatSocket({
      url: "http://localhost:3001",
      tokens: {
        getAccessToken: () => "access-token-123",
        refreshAccessToken: () => Promise.resolve("access-token-123"),
      },
      factory,
    });

    socket.connect();

    expect(factory).toHaveBeenCalledWith(
      "http://localhost:3001",
      "access-token-123",
    );
  });

  it("rejoins the active household room on every (re)connect", () => {
    const fake = createFakeSocket();
    const socket = new ChatSocket({
      url: "u",
      tokens: {
        getAccessToken: () => "t",
        refreshAccessToken: () => Promise.resolve("t"),
      },
      factory: () => fake.socket,
    });

    socket.connect();
    socket.joinHousehold(HOUSEHOLD);

    fake.fire("connect");
    fake.fire("connect"); // simulate a reconnect

    const joins = fake.emit.mock.calls.filter(
      ([event]) => event === "joinHousehold",
    );
    expect(joins).toHaveLength(2);
    expect(joins[0]?.[1]).toEqual({ householdId: HOUSEHOLD });
  });

  it("surfaces joinRejected to subscribers", () => {
    const fake = createFakeSocket();
    const socket = new ChatSocket({
      url: "u",
      tokens: {
        getAccessToken: () => "t",
        refreshAccessToken: () => Promise.resolve("t"),
      },
      factory: () => fake.socket,
    });
    const onRejected = jest.fn();
    socket.on("joinRejected", onRejected);

    socket.connect();
    fake.fire("joinRejected", { householdId: HOUSEHOLD });

    expect(onRejected).toHaveBeenCalledWith({ householdId: HOUSEHOLD });
  });

  it("tears the socket down cleanly on disconnect", () => {
    const fake = createFakeSocket();
    const socket = new ChatSocket({
      url: "u",
      tokens: {
        getAccessToken: () => "t",
        refreshAccessToken: () => Promise.resolve("t"),
      },
      factory: () => fake.socket,
    });

    socket.connect();
    socket.disconnect();

    expect(fake.removeAllListeners).toHaveBeenCalled();
    expect(fake.disconnect).toHaveBeenCalled();
  });

  it("refreshes the token and reconnects on an unauthorized handshake", async () => {
    const fake = createFakeSocket();
    const factory: SocketFactory = jest.fn(() => fake.socket);
    const refreshAccessToken = jest.fn(() => Promise.resolve("fresh-token"));
    const socket = new ChatSocket({
      url: "u",
      tokens: { getAccessToken: () => "stale-token", refreshAccessToken },
      factory,
    });

    socket.connect();
    fake.fire("unauthorized", { message: "expired" });
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    // A fresh socket is built with the rotated token.
    expect(factory).toHaveBeenLastCalledWith("u", "fresh-token");
  });
});
