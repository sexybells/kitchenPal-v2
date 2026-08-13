import { io, type Socket } from "socket.io-client";
import { z } from "zod";
import {
  messageResponseSchema,
  notificationResponseSchema,
  type MessageResponse,
  type NotificationResponse,
} from "@kitchenpal/api-contract";

/**
 * Server-emitted socket events (see the chat gateway). `message` covers new
 * messages and system cards; `voteUpdated` carries the re-tallied vote message;
 * `messagesRead` is a read-receipt fanout; `notification` is a per-user push;
 * `joinRejected`/`unauthorized` are the security fail-closed signals.
 */
export interface ServerEvents {
  message: (message: MessageResponse) => void;
  voteUpdated: (message: MessageResponse) => void;
  messagesRead: (payload: {
    householdId: string;
    userId: string;
    messageIds: string[];
  }) => void;
  notification: (notification: NotificationResponse) => void;
  joinRejected: (payload: { householdId: string }) => void;
  unauthorized: (payload: { message: string }) => void;
  /**
   * A peer-typing signal. The gateway does not rebroadcast typing yet, so this
   * only fires on a real event — the indicator is never faked with timers.
   */
  typing: (payload: { householdId: string; userId: string }) => void;
}

/**
 * Zod schemas for every server->client payload. The socket boundary mirrors
 * the REST client's response validation: a frame that does not match its
 * contract (e.g. from a version-skewed server) is dropped before it can throw
 * inside listeners or message reducers.
 */
const serverEventSchemas = {
  message: messageResponseSchema,
  voteUpdated: messageResponseSchema,
  messagesRead: z.object({
    householdId: z.string(),
    userId: z.string(),
    messageIds: z.array(z.string()),
  }),
  notification: notificationResponseSchema,
  joinRejected: z.object({ householdId: z.string() }),
  unauthorized: z.object({ message: z.string() }),
  typing: z.object({ householdId: z.string(), userId: z.string() }),
} satisfies Record<keyof ServerEvents, z.ZodTypeAny>;

/** Acknowledgement the gateway returns to the emitting client for every event. */
export interface SocketAck {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Lifecycle a listener can observe to reflect connection state in the UI. */
export type SocketStatus = "connecting" | "connected" | "disconnected";

/** Injectable so tests can supply a mocked socket without opening a connection. */
export type SocketFactory = (url: string, token: string) => Socket;

/** Supplies the current access token and refreshes it when it has expired. */
export interface TokenProvider {
  getAccessToken: () => string | null;
  /** Force a token rotation (used after an `unauthorized`); returns the new token. */
  refreshAccessToken: () => Promise<string | null>;
}

export interface ChatSocketConfig {
  url: string;
  tokens: TokenProvider;
  /** Defaults to a real socket.io connection; overridden in tests. */
  factory?: SocketFactory;
}

/** Default factory: a real socket.io client authenticated via the handshake. */
const defaultFactory: SocketFactory = (url, token) =>
  io(url, {
    transports: ["websocket"],
    auth: { token },
    autoConnect: true,
    // We drive reconnection + token refresh ourselves so a rotated token is
    // always used on the next attempt.
    reconnection: true,
  });

/**
 * Thin, testable wrapper around the household chat socket.
 *
 * Responsibilities:
 *  - authenticate the handshake with the current ACCESS token;
 *  - (re)join the active household room on every (re)connect;
 *  - on `unauthorized` (expired token), refresh the token and reconnect with it;
 *  - fan server events out to registered listeners;
 *  - tear the connection down cleanly on `disconnect()`.
 *
 * All socket access is injected via `factory`, so unit tests drive it with a
 * mocked socket and never open a real connection.
 */
export class ChatSocket {
  private readonly url: string;
  private readonly tokens: TokenProvider;
  private readonly factory: SocketFactory;

  private socket: Socket | null = null;
  private householdId: string | null = null;
  private status: SocketStatus = "disconnected";
  /** Guards against overlapping refresh+reconnect cycles. */
  private refreshing = false;

  private readonly serverListeners = new Map<
    keyof ServerEvents,
    Set<(payload: never) => void>
  >();
  private readonly statusListeners = new Set<(status: SocketStatus) => void>();

  constructor(config: ChatSocketConfig) {
    this.url = config.url;
    this.tokens = config.tokens;
    this.factory = config.factory ?? defaultFactory;
  }

  /** Open the connection (idempotent). No-op when there is no access token. */
  connect(): void {
    if (this.socket) return;
    const token = this.tokens.getAccessToken();
    if (!token) return;
    this.setStatus("connecting");
    this.socket = this.factory(this.url, token);
    this.bind(this.socket);
  }

  /** Wire the gateway's lifecycle + domain events onto a fresh socket. */
  private bind(socket: Socket): void {
    socket.on("connect", () => {
      this.setStatus("connected");
      // Rejoin the active room on every (re)connect so a dropped connection
      // transparently restores the subscription.
      if (this.householdId) this.emitJoin(this.householdId);
    });
    socket.on("disconnect", () => this.setStatus("disconnected"));
    socket.io?.on?.("reconnect", () => {
      if (this.householdId) this.emitJoin(this.householdId);
    });
    // An expired/invalid handshake token: refresh once and reconnect with it.
    // The refresh must run even when the payload is malformed, so it is not
    // gated on validation.
    socket.on("unauthorized", (payload: unknown) => {
      this.dispatchValidated("unauthorized", payload);
      void this.refreshAndReconnect();
    });

    for (const event of [
      "message",
      "voteUpdated",
      "messagesRead",
      "notification",
      "joinRejected",
      "typing",
    ] as const) {
      socket.on(event, (payload: unknown) =>
        this.dispatchValidated(event, payload),
      );
    }
  }

  /** Validate a server payload against its contract, then fan out. Drops
   * malformed frames so they never reach listeners. */
  private dispatchValidated<E extends keyof ServerEvents>(
    event: E,
    payload: unknown,
  ): void {
    const parsed = serverEventSchemas[event].safeParse(payload);
    if (!parsed.success) {
      if (__DEV__) {
        console.warn(`[chat-socket] dropped malformed "${event}" payload`);
      }
      return;
    }
    this.dispatch(event, parsed.data as Parameters<ServerEvents[E]>[0]);
  }

  /** Set (and switch to) the active household room. */
  joinHousehold(householdId: string): void {
    this.householdId = householdId;
    if (this.status === "connected") this.emitJoin(householdId);
  }

  private emitJoin(householdId: string): void {
    this.socket?.emit("joinHousehold", { householdId });
  }

  /** Leave the current household room (keeps the connection for notifications). */
  leaveHousehold(): void {
    if (this.householdId && this.socket) {
      this.socket.emit("leaveHousehold", { householdId: this.householdId });
    }
    this.householdId = null;
  }

  /**
   * Send a text message, resolving with the server-confirmed message from the
   * ack. Rejects when the socket is down or the gateway returns an error, so the
   * caller can mark the optimistic message failed.
   */
  sendMessage(householdId: string, text: string): Promise<MessageResponse> {
    return this.emitWithAck<MessageResponse>("sendMessage", {
      householdId,
      text,
    });
  }

  /** Cast (or move) the caller's vote; resolves with the re-tallied message. */
  castVote(
    householdId: string,
    messageId: string,
    optionId: string,
  ): Promise<MessageResponse> {
    return this.emitWithAck<MessageResponse>("castVote", {
      householdId,
      messageId,
      optionId,
    });
  }

  /** Mark messages read over the socket (fires the read-receipt fanout). */
  markRead(householdId: string, messageIds: string[]): void {
    this.socket?.emit("markRead", { householdId, messageIds });
  }

  /**
   * Fire-and-forget typing signal for the active household. Harmless if the
   * gateway does not yet rebroadcast it (no ack expected).
   */
  emitTyping(householdId: string): void {
    if (this.status === "connected") {
      this.socket?.emit("typing", { householdId });
    }
  }

  /** Emit an event and resolve/reject from the gateway ack. */
  private emitWithAck<T>(event: string, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.socket || this.status !== "connected") {
        reject(new Error("socket-disconnected"));
        return;
      }
      this.socket.emit(event, payload, (ack: SocketAck) => {
        if (ack?.ok) resolve(ack.data as T);
        else reject(new Error(ack?.error ?? "socket-error"));
      });
    });
  }

  /** Subscribe to a server event; returns an unsubscribe function. */
  on<E extends keyof ServerEvents>(
    event: E,
    handler: ServerEvents[E],
  ): () => void {
    const set = this.serverListeners.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.serverListeners.set(event, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  /** Observe connection status transitions. Returns an unsubscribe function. */
  onStatus(handler: (status: SocketStatus) => void): () => void {
    this.statusListeners.add(handler);
    handler(this.status);
    return () => this.statusListeners.delete(handler);
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  private dispatch<E extends keyof ServerEvents>(
    event: E,
    payload: Parameters<ServerEvents[E]>[0],
  ): void {
    const set = this.serverListeners.get(event);
    if (!set) return;
    for (const handler of set) (handler as ServerEvents[E])(payload as never);
  }

  private setStatus(status: SocketStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusListeners) handler(status);
  }

  /** Refresh the access token then rebuild the socket with the new handshake. */
  private async refreshAndReconnect(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const token = await this.tokens.refreshAccessToken();
      this.teardownSocket();
      if (!token) {
        this.setStatus("disconnected");
        return;
      }
      this.setStatus("connecting");
      this.socket = this.factory(this.url, token);
      this.bind(this.socket);
    } finally {
      this.refreshing = false;
    }
  }

  /** Detach + close the current socket without clearing listeners/room intent. */
  private teardownSocket(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  /** Fully tear down: close the socket and drop all listeners + room state. */
  disconnect(): void {
    this.teardownSocket();
    this.serverListeners.clear();
    this.statusListeners.clear();
    this.householdId = null;
    this.status = "disconnected";
  }
}
