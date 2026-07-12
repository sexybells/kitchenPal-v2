import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  budgetResponseSchema,
  expenseResponseSchema,
  priceHistoryResponseSchema,
  spendingStatsSchema,
  spendingSummarySchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryReplSet } from "./in-memory-mongo";

describe("Spending (e2e)", () => {
  let app: INestApplication;
  // A replica set is required for the transactional expense↔budget path.
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

  async function registerUser(): Promise<string> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `spend-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Spender",
      });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function setBudget(token: string, amount: number): Promise<void> {
    const res = await request(server)
      .post("/budgets")
      .set(auth(token))
      .send({ amount });
    expect(res.status).toBe(201);
  }

  it("auto-computes unit prices in whole đồng", async () => {
    const token = await registerUser();
    const res = await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({
        totalAmount: 50000,
        category: "groceries",
        items: [{ name: "Rice", quantity: 2, total: 50000 }],
      });
    expect(res.status).toBe(201);
    const expense = expenseResponseSchema.parse(res.body.data);
    expect(expense.currency).toBe("VND");
    expect(expense.items[0]?.unitPrice).toBe(25000);
  });

  it("deducts the budget atomically and refunds on delete", async () => {
    const token = await registerUser();
    await setBudget(token, 1_000_000);

    const created = await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({ totalAmount: 200_000, category: "groceries" });
    const expenseId = created.body.data.id as string;

    const afterCharge = await request(server)
      .get("/budgets/current")
      .set(auth(token));
    const charged = budgetResponseSchema.parse(afterCharge.body.data);
    expect(charged.spent).toBe(200_000);
    expect(charged.remaining).toBe(800_000);

    const del = await request(server)
      .delete(`/expenses/${expenseId}`)
      .set(auth(token));
    expect(del.status).toBe(200);

    const afterRefund = await request(server)
      .get("/budgets/current")
      .set(auth(token));
    const refunded = budgetResponseSchema.parse(afterRefund.body.data);
    expect(refunded.spent).toBe(0);
    expect(refunded.remaining).toBe(1_000_000);
  });

  it("does not lose updates when expenses post concurrently", async () => {
    const token = await registerUser();
    await setBudget(token, 1_000_000);

    const posts = Array.from({ length: 6 }, () =>
      request(server)
        .post("/expenses")
        .set(auth(token))
        .send({ totalAmount: 10_000, category: "groceries" }),
    );
    const results = await Promise.all(posts);
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const budget = await request(server)
      .get("/budgets/current")
      .set(auth(token));
    // 6 × 10_000 all applied — no lost $inc updates.
    expect(budgetResponseSchema.parse(budget.body.data).spent).toBe(60_000);
  });

  it("logs an expense without a budget (personal mode, no crash)", async () => {
    const token = await registerUser();
    const res = await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({ totalAmount: 30_000, category: "dining" });
    expect(res.status).toBe(201);
    expect(res.body.data.totalAmount).toBe(30_000);
  });

  it("summarizes spend by category with budget context", async () => {
    const token = await registerUser();
    await setBudget(token, 500_000);
    await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({ totalAmount: 100_000, category: "groceries" });
    await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({ totalAmount: 40_000, category: "dining" });

    const res = await request(server)
      .get("/spending/summary")
      .set(auth(token));
    expect(res.status).toBe(200);
    const summary = spendingSummarySchema.parse(res.body.data);
    expect(summary.totalSpent).toBe(140_000);
    expect(summary.expenseCount).toBe(2);
    expect(summary.budgetAmount).toBe(500_000);
    expect(summary.budgetRemaining).toBe(360_000);
    const groceries = summary.byCategory.find(
      (row) => row.category === "groceries",
    );
    expect(groceries?.total).toBe(100_000);
  });

  it("buckets stats by day over a range", async () => {
    const token = await registerUser();
    await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({
        totalAmount: 20_000,
        category: "groceries",
        date: "2026-06-01T10:00:00.000Z",
      });
    await request(server)
      .post("/expenses")
      .set(auth(token))
      .send({
        totalAmount: 30_000,
        category: "groceries",
        date: "2026-06-02T10:00:00.000Z",
      });

    const res = await request(server)
      .get("/spending/stats")
      .query({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-03T00:00:00.000Z",
        interval: "day",
      })
      .set(auth(token));
    expect(res.status).toBe(200);
    const stats = spendingStatsSchema.parse(res.body.data);
    expect(stats.series).toEqual([
      { period: "2026-06-01", total: 20_000 },
      { period: "2026-06-02", total: 30_000 },
    ]);
  });

  it("returns price history newest-first with min/max/latest", async () => {
    const token = await registerUser();
    const post = (date: string, unit: number): Promise<unknown> =>
      request(server)
        .post("/expenses")
        .set(auth(token))
        .send({
          totalAmount: unit,
          category: "groceries",
          date,
          items: [{ name: "Rice", quantity: 1, total: unit }],
        });
    await post("2026-05-01T00:00:00.000Z", 20_000);
    await post("2026-06-01T00:00:00.000Z", 24_000);
    await post("2026-07-01T00:00:00.000Z", 22_000);

    const res = await request(server)
      .get("/spending/price-history")
      .query({ name: "Rice" })
      .set(auth(token));
    expect(res.status).toBe(200);
    const history = priceHistoryResponseSchema.parse(res.body.data);
    const rice = history.items.find((item) => item.name === "Rice");
    expect(rice).toBeDefined();
    expect(rice?.latestPrice).toBe(22_000);
    expect(rice?.minPrice).toBe(20_000);
    expect(rice?.maxPrice).toBe(24_000);
    // Observations are ordered most-recent first.
    expect(rice?.points.map((point) => point.unitPrice)).toEqual([
      22_000, 24_000, 20_000,
    ]);
  });

  it("rejects a second budget that overlaps the active cycle", async () => {
    const token = await registerUser();
    await setBudget(token, 500_000);

    // A second budget starting today would cover the same days as the live one,
    // making "the active budget" ambiguous — reject it.
    const second = await request(server)
      .post("/budgets")
      .set(auth(token))
      .send({ amount: 800_000 });
    expect(second.status).toBe(409);

    // The original budget is untouched and still the active one.
    const current = await request(server)
      .get("/budgets/current")
      .set(auth(token));
    expect(budgetResponseSchema.parse(current.body.data).amount).toBe(500_000);
  });

  it("isolates expenses and budgets across users", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    await setBudget(owner, 100_000);
    await request(server)
      .post("/expenses")
      .set(auth(owner))
      .send({ totalAmount: 10_000, category: "groceries" });

    const otherList = await request(server)
      .get("/expenses")
      .set(auth(other));
    expect(otherList.body.data).toHaveLength(0);

    const otherBudget = await request(server)
      .get("/budgets/current")
      .set(auth(other));
    expect(otherBudget.status).toBe(404);
  });
});
