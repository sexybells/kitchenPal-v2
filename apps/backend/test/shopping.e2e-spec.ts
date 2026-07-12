import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { shoppingListResponseSchema } from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryReplSet } from "./in-memory-mongo";

describe("Shopping (e2e)", () => {
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

  async function registerUser(): Promise<string> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `shop-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Shopper",
      });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function createRecipe(
    token: string,
    name: string,
    ingredients: { name: string; quantity?: number; unit?: string }[],
  ): Promise<string> {
    const res = await request(server)
      .post("/recipes")
      .set(auth(token))
      .send({ name, mealType: "dinner", ingredients });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function createPlanWithRecipes(
    token: string,
    recipeIds: string[],
  ): Promise<string> {
    const planRes = await request(server)
      .post("/meal-plans")
      .set(auth(token))
      .send({ weekStart: "2026-07-06T00:00:00.000Z", mealTypes: ["dinner"] });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.data.id as string;
    let version = planRes.body.data.version as number;
    const slots = planRes.body.data.slots as { id: string }[];

    for (let i = 0; i < recipeIds.length; i += 1) {
      const slot = slots[i]!;
      const patch = await request(server)
        .patch(`/meal-plans/${planId}/slots/${slot.id}`)
        .set(auth(token))
        .send({ recipeId: recipeIds[i], expectedVersion: version });
      expect(patch.status).toBe(200);
      version = patch.body.data.version as number;
    }
    return planId;
  }

  it("generates a list: dedupes across recipes and excludes pantry stock", async () => {
    const token = await registerUser();
    // Sugar is on hand, so it must NOT appear on the list.
    await request(server)
      .post("/pantry/items")
      .set(auth(token))
      .send({ name: "Sugar", category: "Baking", stockState: "plenty" });

    const recipeA = await createRecipe(token, "Cake", [
      { name: "Flour", quantity: 2, unit: "cups" },
      { name: "Sugar", quantity: 1, unit: "cup" },
      { name: "Eggs", quantity: 3, unit: "pcs" },
    ]);
    const recipeB = await createRecipe(token, "Bread", [
      { name: "Flour", quantity: 1, unit: "cups" },
      { name: "Butter", quantity: 100, unit: "g" },
    ]);
    const planId = await createPlanWithRecipes(token, [recipeA, recipeB]);

    const res = await request(server)
      .post("/shopping/generate")
      .set(auth(token))
      .send({ mealPlanId: planId });
    expect(res.status).toBe(200);
    const list = shoppingListResponseSchema.parse(res.body.data);

    const names = list.items.map((item) => item.name).sort();
    expect(names).toEqual(["Butter", "Eggs", "Flour"]);
    expect(list.items.some((item) => item.name === "Sugar")).toBe(false);

    const flour = list.items.find((item) => item.name === "Flour");
    // 2 cups (Cake) + 1 cup (Bread), same unit → merged into one line.
    expect(flour?.quantity).toBe(3);
    expect(flour?.sourceRecipeId).toBe(recipeA);
  });

  it("regenerating the same plan is idempotent (no duplicates)", async () => {
    const token = await registerUser();
    const recipe = await createRecipe(token, "Soup", [
      { name: "Carrot", quantity: 2, unit: "pcs" },
    ]);
    const planId = await createPlanWithRecipes(token, [recipe]);

    const first = await request(server)
      .post("/shopping/generate")
      .set(auth(token))
      .send({ mealPlanId: planId });
    const second = await request(server)
      .post("/shopping/generate")
      .set(auth(token))
      .send({ mealPlanId: planId });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.items).toHaveLength(1);
  });

  it("adds ad-hoc needed items to the current list (refill hand-off)", async () => {
    const token = await registerUser();
    const res = await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Milk", unit: "l" }, { name: "Rice" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);

    // Replaying the same hand-off merges rather than duplicating.
    const again = await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Milk", unit: "l" }] });
    expect(again.body.data.items).toHaveLength(2);
  });

  it("toggles bought and rejects a stale write with 409", async () => {
    const token = await registerUser();
    const created = await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Bread" }] });
    const list = shoppingListResponseSchema.parse(created.body.data);
    const itemId = list.items[0]!.id;

    const toggle = await request(server)
      .patch(`/shopping/${list.id}/items/${itemId}`)
      .set(auth(token))
      .send({ bought: true, expectedVersion: list.version });
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.items[0].bought).toBe(true);

    // A second writer still holding the old version is rejected.
    const stale = await request(server)
      .patch(`/shopping/${list.id}/items/${itemId}`)
      .set(auth(token))
      .send({ bought: false, expectedVersion: list.version });
    expect(stale.status).toBe(409);
  });

  it("lets only one of two concurrent stale toggles win", async () => {
    const token = await registerUser();
    const created = await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Eggs" }] });
    const list = shoppingListResponseSchema.parse(created.body.data);
    const itemId = list.items[0]!.id;

    const [a, b] = await Promise.all([
      request(server)
        .patch(`/shopping/${list.id}/items/${itemId}`)
        .set(auth(token))
        .send({ bought: true, expectedVersion: list.version }),
      request(server)
        .patch(`/shopping/${list.id}/items/${itemId}`)
        .set(auth(token))
        .send({ name: "Free-range Eggs", expectedVersion: list.version }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("adds and deletes items with a version guard", async () => {
    const token = await registerUser();
    const created = await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Tea" }] });
    const list = shoppingListResponseSchema.parse(created.body.data);

    const added = await request(server)
      .post(`/shopping/${list.id}/items`)
      .set(auth(token))
      .send({ name: "Coffee", expectedVersion: list.version });
    expect(added.status).toBe(201);
    const withCoffee = shoppingListResponseSchema.parse(added.body.data);
    expect(withCoffee.items).toHaveLength(2);

    const coffee = withCoffee.items.find((item) => item.name === "Coffee")!;
    const del = await request(server)
      .delete(`/shopping/${list.id}/items/${coffee.id}`)
      .query({ expectedVersion: withCoffee.version })
      .set(auth(token));
    expect(del.status).toBe(200);
    expect(del.body.data.items).toHaveLength(1);
  });

  it("does not drop items when needed-item hand-offs run concurrently", async () => {
    const token = await registerUser();
    // Seed the current list so every concurrent add hits the merge-into-existing
    // path (the automated refill / add-missing seam).
    await request(server)
      .post("/shopping/needed-items")
      .set(auth(token))
      .send({ items: [{ name: "Base" }] });

    const names = ["Apples", "Bananas", "Carrots", "Dates", "Eggplant"];
    const results = await Promise.all(
      names.map((name) =>
        request(server)
          .post("/shopping/needed-items")
          .set(auth(token))
          .send({ items: [{ name }] }),
      ),
    );
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    const current = await request(server)
      .get("/shopping/current")
      .set(auth(token));
    const list = shoppingListResponseSchema.parse(current.body.data);
    // Base + all five concurrent adds converged; nothing was dropped on a 409.
    expect(list.items.map((item) => item.name).sort()).toEqual(
      ["Base", ...names].sort(),
    );
  });

  it("isolates shopping lists across users", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(server)
      .post("/shopping/needed-items")
      .set(auth(owner))
      .send({ items: [{ name: "Secret" }] });
    const listId = created.body.data.id as string;

    const fetched = await request(server)
      .get(`/shopping/${listId}`)
      .set(auth(other));
    expect(fetched.status).toBe(404);
  });
});
