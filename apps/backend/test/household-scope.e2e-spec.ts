import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  budgetResponseSchema,
  expenseResponseSchema,
  householdResponseSchema,
  mealPlanResponseSchema,
  messageResponseSchema,
  notificationResponseSchema,
  pantryItemResponseSchema,
  recipeResponseSchema,
  shoppingListResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryReplSet } from "./in-memory-mongo";

/**
 * End-to-end coverage for household-scope activation: two members of a household
 * SHARE their pantry, recipes, meal plans, shopping lists, and expenses/budgets,
 * while a user's PERSONAL data stays private (a separate bucket) and non-members
 * see nothing. Also verifies that logging an expense in household scope through
 * the live HTTP route posts the chat card + budget alert and notifies members.
 *
 * A replica set is required for the transactional expense↔budget path.
 */
describe("Household scope activation (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.JWT_ACCESS_SECRET;
    mongo = await startInMemoryReplSet();

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

  interface TestUser {
    /** Access token whose scope has NOT yet been switched to a household. */
    personalToken: string;
    refreshToken: string;
    userId: string;
  }

  async function registerUser(): Promise<TestUser> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `scope-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Member",
      });
    expect(res.status).toBe(201);
    return {
      personalToken: res.body.data.tokens.accessToken as string,
      refreshToken: res.body.data.tokens.refreshToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Rotates a user's refresh token to mint a fresh access token that now carries
   * their `activeHouseholdId` — the token minted at registration predates joining
   * a household, so acting in household scope requires this refresh.
   */
  async function householdToken(user: TestUser): Promise<string> {
    const res = await request(server)
      .post("/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    expect(res.status).toBe(200);
    user.refreshToken = res.body.data.refreshToken as string;
    return res.body.data.accessToken as string;
  }

  interface Household {
    householdId: string;
    ownerToken: string;
    owner: TestUser;
    memberToken: string;
    member: TestUser;
  }

  /** Owner + member of a fresh household, each holding a household-scoped token. */
  async function setupHousehold(): Promise<Household> {
    const owner = await registerUser();
    const member = await registerUser();

    const created = await request(server)
      .post("/households")
      .set(auth(owner.personalToken))
      .send({ name: "Home" });
    expect(created.status).toBe(201);
    const householdId = householdResponseSchema.parse(created.body.data).id;

    const invite = await request(server)
      .post(`/households/${householdId}/invites`)
      .set(auth(owner.personalToken))
      .send({ ttlHours: 24 });
    expect(invite.status).toBe(201);
    const accepted = await request(server)
      .post(`/invites/${invite.body.data.code}/accept`)
      .set(auth(member.personalToken));
    expect(accepted.status).toBe(200);

    return {
      householdId,
      ownerToken: await householdToken(owner),
      owner,
      memberToken: await householdToken(member),
      member,
    };
  }

  it("shares pantry items between two members", async () => {
    const { ownerToken, memberToken } = await setupHousehold();

    const created = await request(server)
      .post("/pantry/items")
      .set(auth(ownerToken))
      .send({ name: "Household Milk", category: "Dairy" });
    expect(created.status).toBe(201);
    const item = pantryItemResponseSchema.parse(created.body.data);

    // The other member sees what the owner created.
    const memberList = await request(server)
      .get("/pantry/items")
      .set(auth(memberToken));
    expect(memberList.body.data.map((i: { name: string }) => i.name)).toContain(
      "Household Milk",
    );

    // The member can edit the shared item; the owner sees the update.
    const patched = await request(server)
      .patch(`/pantry/items/${item.id}`)
      .set(auth(memberToken))
      .send({ name: "Shared Milk" });
    expect(patched.status).toBe(200);

    const ownerList = await request(server)
      .get("/pantry/items")
      .set(auth(ownerToken));
    expect(ownerList.body.data[0].name).toBe("Shared Milk");
  });

  it("shares recipes between two members", async () => {
    const { ownerToken, memberToken } = await setupHousehold();

    const created = await request(server)
      .post("/recipes")
      .set(auth(ownerToken))
      .send({
        name: "Family Pho",
        mealType: "dinner",
        tags: ["soup"],
        ingredients: [{ name: "Beef" }],
        steps: ["Simmer"],
      });
    expect(created.status).toBe(201);
    const recipe = recipeResponseSchema.parse(created.body.data);
    expect(recipe.scope).toBe("household");

    const memberList = await request(server)
      .get("/recipes")
      .set(auth(memberToken));
    expect(memberList.body.data.map((r: { name: string }) => r.name)).toContain(
      "Family Pho",
    );

    // The member can open the shared (unpublished) recipe by id.
    const byId = await request(server)
      .get(`/recipes/${recipe.id}`)
      .set(auth(memberToken));
    expect(byId.status).toBe(200);
  });

  it("shares one meal plan per week: a second member's create converges on it", async () => {
    const { ownerToken, memberToken } = await setupHousehold();
    const weekStart = "2026-03-02T00:00:00.000Z";

    const created = await request(server)
      .post("/meal-plans")
      .set(auth(ownerToken))
      .send({ weekStart, mealTypes: ["dinner"] });
    expect(created.status).toBe(201);
    const plan = mealPlanResponseSchema.parse(created.body.data);
    expect(plan.scope).toBe("household");

    // The member creating the same week gets the SAME shared plan, not a duplicate.
    const memberCreate = await request(server)
      .post("/meal-plans")
      .set(auth(memberToken))
      .send({ weekStart, mealTypes: ["dinner"] });
    expect(memberCreate.status).toBe(201);
    expect(mealPlanResponseSchema.parse(memberCreate.body.data).id).toBe(plan.id);

    // And can read it by id.
    const byId = await request(server)
      .get(`/meal-plans/${plan.id}`)
      .set(auth(memberToken));
    expect(byId.status).toBe(200);
  });

  it("shares the shopping list between two members", async () => {
    const { ownerToken, memberToken } = await setupHousehold();

    const seeded = await request(server)
      .post("/shopping/needed-items")
      .set(auth(ownerToken))
      .send({ items: [{ name: "Eggs", quantity: 12 }] });
    expect(seeded.status).toBe(200);

    const memberCurrent = await request(server)
      .get("/shopping/current")
      .set(auth(memberToken));
    expect(memberCurrent.status).toBe(200);
    const list = shoppingListResponseSchema.parse(memberCurrent.body.data);
    expect(list.scope).toBe("household");
    expect(list.items.map((i) => i.name)).toContain("Eggs");
  });

  it("shares expenses and the budget between two members", async () => {
    const { ownerToken, memberToken } = await setupHousehold();

    const budget = await request(server)
      .post("/budgets")
      .set(auth(ownerToken))
      .send({ amount: 1_000_000 });
    expect(budget.status).toBe(201);

    // The member logs an expense against the shared household budget.
    const expense = await request(server)
      .post("/expenses")
      .set(auth(memberToken))
      .send({ totalAmount: 200_000, category: "groceries" });
    expect(expense.status).toBe(201);
    expect(expenseResponseSchema.parse(expense.body.data).scope).toBe(
      "household",
    );

    // The owner sees the member's expense and the deducted shared budget.
    const ownerExpenses = await request(server)
      .get("/expenses")
      .set(auth(ownerToken));
    expect(ownerExpenses.body.data).toHaveLength(1);

    const ownerBudget = await request(server)
      .get("/budgets/current")
      .set(auth(ownerToken));
    expect(budgetResponseSchema.parse(ownerBudget.body.data).spent).toBe(
      200_000,
    );
  });

  it("keeps personal data and household data in separate buckets for the same user", async () => {
    const user = await registerUser();

    // A pantry item created BEFORE joining a household is personal.
    const personalItem = await request(server)
      .post("/pantry/items")
      .set(auth(user.personalToken))
      .send({ name: "Personal Snack", category: "X" });
    expect(personalItem.status).toBe(201);

    // Switch into a household (the pre-join token stays personal).
    const created = await request(server)
      .post("/households")
      .set(auth(user.personalToken))
      .send({ name: "Solo Home" });
    expect(created.status).toBe(201);
    const hhToken = await householdToken(user);

    // Household scope does NOT see the personal item.
    const hhList = await request(server)
      .get("/pantry/items")
      .set(auth(hhToken));
    expect(hhList.body.data).toHaveLength(0);

    const hhItem = await request(server)
      .post("/pantry/items")
      .set(auth(hhToken))
      .send({ name: "Household Snack", category: "X" });
    expect(hhItem.status).toBe(201);

    // Personal scope still sees only the personal item, never the household one.
    const personalList = await request(server)
      .get("/pantry/items")
      .set(auth(user.personalToken));
    expect(personalList.body.data.map((i: { name: string }) => i.name)).toEqual(
      ["Personal Snack"],
    );
  });

  it("hides household data from a non-member across every module", async () => {
    const { ownerToken, householdId } = await setupHousehold();
    const outsider = await registerUser();

    // The household owner creates data in each module.
    const recipe = recipeResponseSchema.parse(
      (
        await request(server)
          .post("/recipes")
          .set(auth(ownerToken))
          .send({
            name: "Secret Household Recipe",
            mealType: "dinner",
            tags: [],
            ingredients: [{ name: "Beef" }],
            steps: ["Cook"],
          })
      ).body.data,
    );
    const plan = mealPlanResponseSchema.parse(
      (
        await request(server)
          .post("/meal-plans")
          .set(auth(ownerToken))
          .send({ weekStart: "2026-04-06T00:00:00.000Z", mealTypes: ["dinner"] })
      ).body.data,
    );
    await request(server)
      .post("/pantry/items")
      .set(auth(ownerToken))
      .send({ name: "Secret Pantry", category: "X" });
    await request(server)
      .post("/budgets")
      .set(auth(ownerToken))
      .send({ amount: 500_000 });
    const expense = expenseResponseSchema.parse(
      (
        await request(server)
          .post("/expenses")
          .set(auth(ownerToken))
          .send({ totalAmount: 50_000, category: "groceries" })
      ).body.data,
    );

    // The outsider (no membership) sees none of it and cannot reach it by id.
    expect(
      (await request(server).get("/pantry/items").set(auth(outsider.personalToken)))
        .body.data,
    ).toHaveLength(0);
    expect(
      (await request(server).get("/recipes").set(auth(outsider.personalToken)))
        .body.data,
    ).toHaveLength(0);
    expect(
      (await request(server).get("/expenses").set(auth(outsider.personalToken)))
        .body.data,
    ).toHaveLength(0);

    for (const res of [
      await request(server)
        .get(`/recipes/${recipe.id}`)
        .set(auth(outsider.personalToken)),
      await request(server)
        .patch(`/recipes/${recipe.id}`)
        .set(auth(outsider.personalToken))
        .send({ name: "Hijacked" }),
      await request(server)
        .get(`/meal-plans/${plan.id}`)
        .set(auth(outsider.personalToken)),
      await request(server)
        .delete(`/expenses/${expense.id}`)
        .set(auth(outsider.personalToken)),
    ]) {
      expect(res.status).toBe(404);
    }

    // The outsider is not even a member of the household.
    const read = await request(server)
      .get(`/households/${householdId}`)
      .set(auth(outsider.personalToken));
    expect(read.status).toBe(404);
  });

  it("posts an expense card + budget alert and notifies members via the live expense route", async () => {
    const { ownerToken, memberToken, householdId } = await setupHousehold();

    // A small budget so the very first expense trips the over-budget alert.
    const budget = await request(server)
      .post("/budgets")
      .set(auth(ownerToken))
      .send({ amount: 100_000 });
    expect(budget.status).toBe(201);

    const expense = await request(server)
      .post("/expenses")
      .set(auth(ownerToken))
      .send({ totalAmount: 250_000, category: "groceries" });
    expect(expense.status).toBe(201);

    // The live route drove the chat seam: an expense card and a budget alert.
    const messages = await request(server)
      .get(`/households/${householdId}/messages`)
      .set(auth(memberToken));
    const types = messages.body.data.map(
      (row: unknown) => messageResponseSchema.parse(row).type,
    );
    expect(types).toEqual(expect.arrayContaining(["expense", "budget_alert"]));

    // The other member (fetching their own feed) was notified about the alert.
    const notifs = await request(server)
      .get("/notifications")
      .set(auth(memberToken));
    const records = notifs.body.data.map((row: unknown) =>
      notificationResponseSchema.parse(row),
    );
    expect(
      records.some((row: { type: string }) => row.type === "budget_alert"),
    ).toBe(true);
  });
});
