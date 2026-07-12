import type { AddressInfo } from "node:net";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { messageResponseSchema } from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AuthenticatedIoAdapter } from "../src/common/socket/authenticated-io.adapter";
import { startInMemoryMongo } from "./in-memory-mongo";

interface TestUser {
  token: string;
  userId: string;
}

/** Resolves the next occurrence of an event, or rejects on timeout. */
function waitFor<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    const handler = (payload: T): void => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Asserts an event does NOT arrive within the window (isolation check). */
async function expectNoEvent(
  socket: Socket,
  event: string,
  windowMs = 600,
): Promise<void> {
  let received = false;
  const handler = (): void => {
    received = true;
  };
  socket.on(event, handler);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  socket.off(event, handler);
  expect(received).toBe(false);
}

describe("Chat socket (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.SOCKET_CORS_ORIGINS;
    mongo = await startInMemoryMongo();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new AuthenticatedIoAdapter(app));
    await app.init();
    await app.listen(0);
    server = app.getHttpServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    await app?.close();
    await mongo?.stop();
  });

  function connect(token?: string): Socket {
    const socket = io(baseUrl, {
      transports: ["websocket"],
      auth: token ? { token } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  async function registerUser(): Promise<TestUser> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `sock-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Socket",
      });
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createHousehold(owner: TestUser): Promise<string> {
    const res = await request(server)
      .post("/households")
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ name: "Home" });
    return res.body.data.id as string;
  }

  async function join(
    owner: TestUser,
    householdId: string,
    joiner: TestUser,
  ): Promise<void> {
    const invite = await request(server)
      .post(`/households/${householdId}/invites`)
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ ttlHours: 24 });
    await request(server)
      .post(`/invites/${invite.body.data.code}/accept`)
      .set({ Authorization: `Bearer ${joiner.token}` });
  }

  function emit<T = unknown>(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      socket.emit(event, payload, (ack: T) => resolve(ack));
    });
  }

  it("disconnects a socket that presents no token", async () => {
    const socket = connect();
    const reason = await waitFor(socket, "unauthorized");
    expect(reason).toBeDefined();
  });

  it("delivers a member's message to another member but not to a non-member", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const outsider = await registerUser();
    const householdId = await createHousehold(owner);
    await join(owner, householdId, member);

    const ownerSocket = connect(owner.token);
    const memberSocket = connect(member.token);
    const outsiderSocket = connect(outsider.token);
    await Promise.all([
      waitFor(ownerSocket, "connect"),
      waitFor(memberSocket, "connect"),
      waitFor(outsiderSocket, "connect"),
    ]);

    // Members join successfully; the non-member is rejected and never in the room.
    const ownerJoin = await emit<{ ok: boolean }>(ownerSocket, "joinHousehold", {
      householdId,
    });
    const memberJoin = await emit<{ ok: boolean }>(
      memberSocket,
      "joinHousehold",
      { householdId },
    );
    expect(ownerJoin.ok).toBe(true);
    expect(memberJoin.ok).toBe(true);

    const rejection = waitFor(outsiderSocket, "joinRejected");
    const outsiderJoin = await emit<{ ok: boolean }>(
      outsiderSocket,
      "joinHousehold",
      { householdId },
    );
    expect(outsiderJoin.ok).toBe(false);
    await expect(rejection).resolves.toMatchObject({ householdId });

    // The member receives the message; the non-member does not.
    const memberReceives = waitFor(memberSocket, "message");
    const outsiderSilent = expectNoEvent(outsiderSocket, "message");
    const ack = await emit<{ ok: boolean; data: unknown }>(
      ownerSocket,
      "sendMessage",
      { householdId, text: "Hello household" },
    );
    expect(ack.ok).toBe(true);

    const received = messageResponseSchema.parse(await memberReceives);
    expect(received.text).toBe("Hello household");
    await outsiderSilent;
  });

  it("updates the vote tally live when a member casts a vote", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await join(owner, householdId, member);

    const ownerSocket = connect(owner.token);
    const memberSocket = connect(member.token);
    await Promise.all([
      waitFor(ownerSocket, "connect"),
      waitFor(memberSocket, "connect"),
    ]);
    await emit(ownerSocket, "joinHousehold", { householdId });
    await emit(memberSocket, "joinHousehold", { householdId });

    // Owner posts a poll over REST; both sockets are in the room.
    const poll = await request(server)
      .post(`/households/${householdId}/messages/vote`)
      .set({ Authorization: `Bearer ${owner.token}` })
      .send({ question: "Dinner?", options: ["Pho", "Bun"] });
    const message = messageResponseSchema.parse(poll.body.data);
    const optionId = message.vote!.options[0]!.id;

    const tallyUpdate = waitFor(ownerSocket, "voteUpdated");
    const ack = await emit<{ ok: boolean }>(memberSocket, "castVote", {
      householdId,
      messageId: message.id,
      optionId,
    });
    expect(ack.ok).toBe(true);

    const updated = messageResponseSchema.parse(await tallyUpdate);
    const tally = updated.vote!.tally.find((row) => row.optionId === optionId);
    expect(tally?.count).toBe(1);
    expect(tally?.voterIds).toContain(member.userId);
  });

  it("stops delivering broadcasts to a member's socket after they are removed", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await join(owner, householdId, member);

    const ownerSocket = connect(owner.token);
    const memberSocket = connect(member.token);
    await Promise.all([
      waitFor(ownerSocket, "connect"),
      waitFor(memberSocket, "connect"),
    ]);
    await emit(ownerSocket, "joinHousehold", { householdId });
    await emit(memberSocket, "joinHousehold", { householdId });

    // Sanity: while still a member, the member receives a broadcast.
    const firstReceived = waitFor(memberSocket, "message");
    await emit(ownerSocket, "sendMessage", { householdId, text: "still here" });
    expect(messageResponseSchema.parse(await firstReceived).text).toBe(
      "still here",
    );

    // The owner removes the member; the server evicts their socket from the room.
    const membersRes = await request(server)
      .get(`/households/${householdId}/members`)
      .set({ Authorization: `Bearer ${owner.token}` });
    const memberRow = membersRes.body.data.find(
      (row: { userId: string }) => row.userId === member.userId,
    );
    const removed = await request(server)
      .delete(`/households/${householdId}/members/${memberRow.id}`)
      .set({ Authorization: `Bearer ${owner.token}` });
    expect(removed.status).toBe(200);

    // Give the adapter a beat to apply the room eviction, then broadcast again.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const silence = expectNoEvent(memberSocket, "message");
    await emit(ownerSocket, "sendMessage", { householdId, text: "after kick" });
    await silence;
    // The socket is still connected — only the household room membership was cut.
    expect(memberSocket.connected).toBe(true);
  });
});
