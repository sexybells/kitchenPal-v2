import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  householdMemberResponseSchema,
  householdResponseSchema,
  messageResponseSchema,
  notificationResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { ChatSpendingEvents } from "../src/modules/household/services/chat-spending-events";
import type { ScopeContext } from "../src/common/scope/scope-context";
import { startInMemoryMongo } from "./in-memory-mongo";

interface TestUser {
  token: string;
  userId: string;
}

describe("Household, chat & notifications (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    delete process.env.JWT_ACCESS_SECRET;
    mongo = await startInMemoryMongo();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  async function registerUser(): Promise<TestUser> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `hh-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Member",
      });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function createHousehold(owner: TestUser): Promise<string> {
    const res = await request(server)
      .post("/households")
      .set(auth(owner.token))
      .send({ name: "Home" });
    expect(res.status).toBe(201);
    return householdResponseSchema.parse(res.body.data).id;
  }

  async function inviteAndAccept(
    owner: TestUser,
    householdId: string,
    joiner: TestUser,
  ): Promise<void> {
    const invite = await request(server)
      .post(`/households/${householdId}/invites`)
      .set(auth(owner.token))
      .send({ ttlHours: 24 });
    expect(invite.status).toBe(201);
    const code = invite.body.data.code as string;

    const accepted = await request(server)
      .post(`/invites/${code}/accept`)
      .set(auth(joiner.token));
    expect(accepted.status).toBe(200);
  }

  it("creates a household with the caller as owner", async () => {
    const owner = await registerUser();
    const res = await request(server)
      .post("/households")
      .set(auth(owner.token))
      .send({ name: "Casa" });
    expect(res.status).toBe(201);
    const household = householdResponseSchema.parse(res.body.data);
    expect(household.myRole).toBe("owner");
    expect(household.membersCount).toBe(1);
  });

  it("adds a member only by accepting an invite; joining otherwise is impossible", async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const householdId = await createHousehold(owner);

    // A non-member cannot even read the household.
    const before = await request(server)
      .get(`/households/${householdId}`)
      .set(auth(joiner.token));
    expect(before.status).toBe(404);

    // A bogus code cannot be redeemed.
    const bogus = await request(server)
      .post(`/invites/not-a-real-code/accept`)
      .set(auth(joiner.token));
    expect(bogus.status).toBe(400);

    await inviteAndAccept(owner, householdId, joiner);

    const after = await request(server)
      .get(`/households/${householdId}`)
      .set(auth(joiner.token));
    expect(after.status).toBe(200);
    expect(householdResponseSchema.parse(after.body.data).membersCount).toBe(2);
  });

  it("does not burn a fresh invite when an existing member redeems it", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const latecomer = await registerUser();
    const householdId = await createHousehold(owner);
    await inviteAndAccept(owner, householdId, member);

    // A brand-new code the already-active member redeems by mistake.
    const invite = await request(server)
      .post(`/households/${householdId}/invites`)
      .set(auth(owner.token))
      .send({ ttlHours: 24 });
    const code = invite.body.data.code as string;

    const reAccept = await request(server)
      .post(`/invites/${code}/accept`)
      .set(auth(member.token));
    expect(reAccept.status).toBe(200);
    // Membership count is unchanged — no double seat.
    expect(householdResponseSchema.parse(reAccept.body.data).membersCount).toBe(
      2,
    );

    // The code was NOT consumed: a genuine newcomer can still use it.
    const joined = await request(server)
      .post(`/invites/${code}/accept`)
      .set(auth(latecomer.token));
    expect(joined.status).toBe(200);
    expect(householdResponseSchema.parse(joined.body.data).membersCount).toBe(3);
  });

  it("lets an owner change roles but forbids a plain member", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await inviteAndAccept(owner, householdId, member);

    const membersRes = await request(server)
      .get(`/households/${householdId}/members`)
      .set(auth(owner.token));
    const members = membersRes.body.data.map((row: unknown) =>
      householdMemberResponseSchema.parse(row),
    );
    const memberRow = members.find(
      (row: { userId: string }) => row.userId === member.userId,
    );
    expect(memberRow).toBeDefined();

    // A plain member cannot promote anyone.
    const forbidden = await request(server)
      .patch(`/households/${householdId}/members/${memberRow.id}`)
      .set(auth(member.token))
      .send({ role: "admin" });
    expect(forbidden.status).toBe(403);

    // The owner can.
    const promoted = await request(server)
      .patch(`/households/${householdId}/members/${memberRow.id}`)
      .set(auth(owner.token))
      .send({ role: "admin" });
    expect(promoted.status).toBe(200);
    expect(householdMemberResponseSchema.parse(promoted.body.data).role).toBe(
      "admin",
    );
  });

  it("blocks a non-member from posting to the chat", async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const householdId = await createHousehold(owner);

    const res = await request(server)
      .post(`/households/${householdId}/messages`)
      .set(auth(outsider.token))
      .send({ text: "let me in" });
    expect(res.status).toBe(404);
  });

  it("posts messages, records read receipts, and notifies other members", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await inviteAndAccept(owner, householdId, member);

    const sent = await request(server)
      .post(`/households/${householdId}/messages`)
      .set(auth(owner.token))
      .send({ text: "Dinner at 7?" });
    expect(sent.status).toBe(201);
    const message = messageResponseSchema.parse(sent.body.data);
    // The sender has implicitly read their own message.
    expect(message.readByUserIds).toContain(owner.userId);

    // The member marks it read.
    const read = await request(server)
      .post(`/households/${householdId}/messages/read`)
      .set(auth(member.token))
      .send({ messageIds: [message.id] });
    expect(read.status).toBe(200);

    const list = await request(server)
      .get(`/households/${householdId}/messages`)
      .set(auth(member.token));
    const stored = messageResponseSchema.parse(list.body.data[0]);
    expect(stored.readByUserIds).toEqual(
      expect.arrayContaining([owner.userId, member.userId]),
    );

    // The member received a chat notification for the message.
    const notifs = await request(server)
      .get("/notifications")
      .set(auth(member.token));
    const records = notifs.body.data.map((row: unknown) =>
      notificationResponseSchema.parse(row),
    );
    expect(
      records.some((row: { type: string }) => row.type === "chat_message"),
    ).toBe(true);
  });

  it("marks a notification read (idempotently)", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await inviteAndAccept(owner, householdId, member);

    // The inviter got an invite_accepted notification.
    const notifs = await request(server)
      .get("/notifications")
      .set(auth(owner.token));
    const record = notificationResponseSchema.parse(notifs.body.data[0]);
    expect(record.readAt).toBeNull();

    const marked = await request(server)
      .patch(`/notifications/${record.id}/read`)
      .set(auth(owner.token));
    expect(marked.status).toBe(200);
    expect(notificationResponseSchema.parse(marked.body.data).readAt).not.toBeNull();
  });

  it("posts an expense card and budget alert when an expense is logged in household scope", async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const householdId = await createHousehold(owner);
    await inviteAndAccept(owner, householdId, member);

    const scope: ScopeContext = {
      scope: "household",
      userId: owner.userId,
      householdId,
    };
    // Drive the spending seam directly (the shopping module binds this exact
    // provider); an over-budget expense posts an expense card + a budget alert.
    const events = app.get(ChatSpendingEvents);
    await events.expenseLogged({
      scope,
      expense: {
        id: "6512aa00aa00aa00aa00aa00",
        scope: "household",
        totalAmount: 250_000,
        currency: "VND",
        category: "groceries",
        note: null,
        date: new Date().toISOString(),
        shoppingListId: null,
        items: [],
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      budget: {
        id: "6512bb00bb00bb00bb00bb00",
        scope: "household",
        amount: 200_000,
        spent: 250_000,
        remaining: -50_000,
        currency: "VND",
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date().toISOString(),
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      overBudget: true,
    });

    const list = await request(server)
      .get(`/households/${householdId}/messages`)
      .set(auth(owner.token));
    const types = list.body.data.map(
      (row: unknown) => messageResponseSchema.parse(row).type,
    );
    expect(types).toEqual(
      expect.arrayContaining(["expense", "budget_alert"]),
    );

    // Members were notified about the budget alert.
    const notifs = await request(server)
      .get("/notifications")
      .set(auth(member.token));
    const records = notifs.body.data.map((row: unknown) =>
      notificationResponseSchema.parse(row),
    );
    expect(
      records.some((row: { type: string }) => row.type === "budget_alert"),
    ).toBe(true);
  });
});
