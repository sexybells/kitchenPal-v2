import { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import {
  autoFillResponseSchema,
  importFromUrlResponseSchema,
  mealPlanResponseSchema,
  pantryMatchResponseSchema,
  recipeResponseSchema,
  suggestionsResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Model } from "mongoose";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { RECIPE_HTTP_CLIENT } from "../src/modules/recipes/ai/recipe-http-client";
import { Recipe } from "../src/modules/recipes/schemas/recipe.schema";
import { startInMemoryReplSet } from "./in-memory-mongo";

/** Canned page with a schema.org Recipe, returned by the stubbed HTTP client. */
const RECIPE_HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Imported Pancakes",
  recipeIngredient: ["2 cups flour", "1 egg"],
  recipeInstructions: ["Mix the batter", "Cook on a griddle"],
  totalTime: "PT20M",
  recipeYield: "4 servings",
  recipeCategory: "breakfast",
})}</script></head><body></body></html>`;

/** Stub HTTP client so import/search never hit the network. */
const stubHttpClient = {
  getText: async (url: string) => {
    if (url.includes("no-recipe")) {
      return { status: 200, body: "<html><body>nothing here</body></html>" };
    }
    return { status: 200, body: RECIPE_HTML };
  },
};

describe("Recipes & meal plans (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let recipeModel: Model<Recipe>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    // No AI keys and no search key: suggestions/auto-fill degrade to heuristics.
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_SEARCH_API_KEY;
    delete process.env.GOOGLE_SEARCH_CX;
    delete process.env.JWT_ACCESS_SECRET;
    mongo = await startInMemoryReplSet();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RECIPE_HTTP_CLIENT)
      .useValue(stubHttpClient)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    recipeModel = app.get<Model<Recipe>>(getModelToken(Recipe.name));
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  async function registerUser(): Promise<string> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `recipes-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Recipe User",
      });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function createRecipe(
    token: string,
    body: Record<string, unknown>,
  ): Promise<ReturnType<typeof recipeResponseSchema.parse>> {
    const res = await request(server)
      .post("/recipes")
      .set(auth(token))
      .send(body);
    expect(res.status).toBe(201);
    return recipeResponseSchema.parse(res.body.data);
  }

  it("hides a personal recipe from other users and reveals it once published", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const recipe = await createRecipe(owner, {
      name: "Owner Secret Stew",
      mealType: "dinner",
      tags: ["hearty"],
      ingredients: [{ name: "Beef" }],
      steps: ["Simmer"],
    });

    // Hidden from another user before publishing.
    const hidden = await request(server)
      .get(`/recipes/${recipe.id}`)
      .set(auth(other));
    expect(hidden.status).toBe(404);
    const otherList = await request(server).get("/recipes").set(auth(other));
    expect(otherList.body.data).toHaveLength(0);

    // Publish → now visible to the other user and in the community feed.
    const published = await request(server)
      .patch(`/recipes/${recipe.id}/publish`)
      .set(auth(owner))
      .send({ published: true });
    expect(published.status).toBe(200);

    const nowVisible = await request(server)
      .get(`/recipes/${recipe.id}`)
      .set(auth(other));
    expect(nowVisible.status).toBe(200);
    expect(recipeResponseSchema.parse(nowVisible.body.data).isOwner).toBe(false);

    const community = await request(server)
      .get("/recipes/community")
      .set(auth(other));
    expect(
      community.body.data.some((r: { id: string }) => r.id === recipe.id),
    ).toBe(true);
  });

  it("makes a system recipe readable by everyone", async () => {
    const user = await registerUser();
    const seeded = await recipeModel.create({
      name: "System Rice",
      normalizedName: "system rice",
      mealType: "lunch",
      tags: ["staple"],
      ingredients: [{ name: "Rice", optional: false }],
      steps: ["Boil"],
      sourceType: "system",
      scope: "system",
      published: false,
      version: 0,
      deletedAt: null,
    });

    const res = await request(server)
      .get(`/recipes/${seeded.id}`)
      .set(auth(user));
    expect(res.status).toBe(200);
    expect(recipeResponseSchema.parse(res.body.data).scope).toBe("system");
  });

  it("lets only the owner edit or delete a recipe", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const recipe = await createRecipe(owner, {
      name: "Shared Soup",
      ingredients: [{ name: "Water" }],
    });
    await request(server)
      .patch(`/recipes/${recipe.id}/publish`)
      .set(auth(owner))
      .send({ published: true });

    // Readable but not owned → forbidden to mutate.
    const edit = await request(server)
      .patch(`/recipes/${recipe.id}`)
      .set(auth(other))
      .send({ name: "Hijacked" });
    expect(edit.status).toBe(403);
    const del = await request(server)
      .delete(`/recipes/${recipe.id}`)
      .set(auth(other));
    expect(del.status).toBe(403);

    // Owner can edit.
    const ownerEdit = await request(server)
      .patch(`/recipes/${recipe.id}`)
      .set(auth(owner))
      .send({ name: "Shared Soup v2" });
    expect(ownerEdit.status).toBe(200);
    expect(recipeResponseSchema.parse(ownerEdit.body.data).name).toBe(
      "Shared Soup v2",
    );
  });

  it("favorites and unfavorites a recipe", async () => {
    const user = await registerUser();
    const recipe = await createRecipe(user, {
      name: "Fave Toast",
      ingredients: [{ name: "Bread" }],
    });

    const fav = await request(server)
      .post(`/recipes/${recipe.id}/favorite`)
      .set(auth(user));
    expect(fav.status).toBe(200);

    const list = await request(server)
      .get("/recipes/favorites")
      .set(auth(user));
    expect(list.body.data.recipes).toHaveLength(1);
    expect(list.body.data.recipes[0].id).toBe(recipe.id);

    const unfav = await request(server)
      .delete(`/recipes/${recipe.id}/favorite`)
      .set(auth(user));
    expect(unfav.status).toBe(200);
    const empty = await request(server)
      .get("/recipes/favorites")
      .set(auth(user));
    expect(empty.body.data.recipes).toHaveLength(0);
  });

  it("recomputes a recipe's rating from all users' comments", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const recipe = await createRecipe(owner, {
      name: "Rated Curry",
      ingredients: [{ name: "Spice" }],
    });
    await request(server)
      .patch(`/recipes/${recipe.id}/publish`)
      .set(auth(owner))
      .send({ published: true });

    const first = await request(server)
      .post(`/recipes/${recipe.id}/comments`)
      .set(auth(owner))
      .send({ rating: 2, text: "ok" });
    expect(first.status).toBe(201);
    await request(server)
      .post(`/recipes/${recipe.id}/comments`)
      .set(auth(other))
      .send({ rating: 4 });

    const fetched = await request(server)
      .get(`/recipes/${recipe.id}`)
      .set(auth(owner));
    const parsed = recipeResponseSchema.parse(fetched.body.data);
    expect(parsed.reviewCount).toBe(2);
    expect(parsed.averageRating).toBe(3);

    const comments = await request(server)
      .get(`/recipes/${recipe.id}/comments`)
      .set(auth(owner));
    expect(comments.body.data.comments).toHaveLength(2);
  });

  it("keeps one rating per user: a repeat rating updates, not duplicates", async () => {
    const user = await registerUser();
    const recipe = await createRecipe(user, {
      name: "Solo Rated Dish",
      ingredients: [{ name: "Salt" }],
    });

    const first = await request(server)
      .post(`/recipes/${recipe.id}/comments`)
      .set(auth(user))
      .send({ rating: 2 });
    expect(first.status).toBe(201);
    const second = await request(server)
      .post(`/recipes/${recipe.id}/comments`)
      .set(auth(user))
      .send({ rating: 5, text: "changed my mind" });
    expect(second.status).toBe(201);

    // The recipe reflects a single deduped rating, not two stacked votes.
    const fetched = await request(server)
      .get(`/recipes/${recipe.id}`)
      .set(auth(user));
    const parsed = recipeResponseSchema.parse(fetched.body.data);
    expect(parsed.reviewCount).toBe(1);
    expect(parsed.averageRating).toBe(5);

    const comments = await request(server)
      .get(`/recipes/${recipe.id}/comments`)
      .set(auth(user));
    expect(comments.body.data.comments).toHaveLength(1);
    expect(comments.body.data.comments[0].rating).toBe(5);
    // Reviews expose the author's display name, not the raw user id.
    expect(comments.body.data.comments[0].authorName).toBe("Recipe User");
    expect(comments.body.data.comments[0].userId).toBeUndefined();
  });

  it("classifies recipe ingredients against the pantry", async () => {
    const user = await registerUser();
    await request(server)
      .post("/pantry/items")
      .set(auth(user))
      .send({ name: "Flour", category: "Baking", stockState: "plenty" });
    await request(server)
      .post("/pantry/items")
      .set(auth(user))
      .send({ name: "Eggs", category: "Dairy", stockState: "some" });

    const recipe = await createRecipe(user, {
      name: "Pantry Match Cake",
      ingredients: [
        { name: "flour" },
        { name: "eggs" },
        { name: "sugar" },
      ],
    });

    const res = await request(server)
      .post(`/recipes/${recipe.id}/pantry-match`)
      .set(auth(user));
    expect(res.status).toBe(200);
    const match = pantryMatchResponseSchema.parse(res.body.data);
    expect(match.totalIngredients).toBe(3);
    expect(match.available.map((i) => i.name).sort()).toEqual(["eggs", "flour"]);
    expect(match.needed.map((i) => i.name)).toEqual(["sugar"]);
    expect(match.matchScore).toBe(0.67);
  });

  it("returns heuristic suggestions and flags degraded without AI keys", async () => {
    const user = await registerUser();
    await request(server)
      .post("/pantry/items")
      .set(auth(user))
      .send({ name: "Tomato", category: "Veg", stockState: "plenty" });
    await createRecipe(user, {
      name: "Tomato Pasta",
      mealType: "dinner",
      ingredients: [{ name: "Tomato" }, { name: "Pasta" }],
    });

    const res = await request(server)
      .post("/recipes/ai-suggestions/pantry")
      .set(auth(user))
      .send({ mealType: "dinner", limit: 5 });
    expect(res.status).toBe(200);
    const body = suggestionsResponseSchema.parse(res.body.data);
    expect(body.degraded).toBe(true);
    expect(body.provider).toBe("none");
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions[0]?.name).toBe("Tomato Pasta");
  });

  it("returns rescues and the day block", async () => {
    const user = await registerUser();
    await request(server)
      .post("/pantry/items")
      .set(auth(user))
      .send({
        name: "cà chua",
        category: "Veg",
        stockState: "plenty",
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    await createRecipe(user, {
      name: "Canh cà chua",
      mealType: "dinner",
      ingredients: [{ name: "cà chua" }, { name: "trứng" }],
    });

    const res = await request(server)
      .post("/recipes/ai-suggestions/pantry")
      .set(auth(user))
      .send({ mealType: "dinner", limit: 5 });
    expect(res.status).toBe(200);
    const body = suggestionsResponseSchema.parse(res.body.data);
    expect(body.suggestions[0]?.rescues[0]?.name).toBe("cà chua");
    expect(body.day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("auto-fills only empty slots and respects a vegetarian diet", async () => {
    const user = await registerUser();
    await request(server)
      .patch("/recipes/preferences")
      .set(auth(user))
      .send({ diet: "vegetarian" });

    const veg = await createRecipe(user, {
      name: "Veggie Bowl",
      mealType: "dinner",
      tags: ["vegetarian"],
      ingredients: [{ name: "Tofu" }],
    });
    await createRecipe(user, {
      name: "Steak Dinner",
      mealType: "dinner",
      tags: ["meat"],
      ingredients: [{ name: "Beef" }],
    });

    const created = await request(server)
      .post("/meal-plans")
      .set(auth(user))
      .send({ weekStart: "2026-07-13T00:00:00.000Z" });
    expect(created.status).toBe(201);
    const plan = mealPlanResponseSchema.parse(created.body.data);

    const filled = await request(server)
      .post(`/meal-plans/${plan.id}/auto-fill`)
      .set(auth(user))
      .send({});
    expect(filled.status).toBe(200);
    const result = autoFillResponseSchema.parse(filled.body.data);
    expect(result.degraded).toBe(true);
    expect(result.needsManual).toBe(false);

    const dinnerSlots = result.plan.slots.filter((s) => s.mealType === "dinner");
    const otherSlots = result.plan.slots.filter((s) => s.mealType !== "dinner");
    // Every dinner slot got the vegetarian recipe; the meat recipe is never used.
    expect(dinnerSlots.every((s) => s.recipeId === veg.id)).toBe(true);
    // Only empty slots with a matching candidate are filled; breakfast/lunch had
    // no vegetarian candidate, so they stay empty (never fabricated).
    expect(otherSlots.every((s) => s.recipeId === null)).toBe(true);
    expect(result.filledSlotIds).toHaveLength(dinnerSlots.length);
  });

  it("guards slot edits with the expected version", async () => {
    const user = await registerUser();
    const recipe = await createRecipe(user, {
      name: "Slot Recipe",
      mealType: "lunch",
      ingredients: [{ name: "Rice" }],
    });
    const created = await request(server)
      .post("/meal-plans")
      .set(auth(user))
      .send({ weekStart: "2026-08-03T00:00:00.000Z" });
    const plan = mealPlanResponseSchema.parse(created.body.data);
    const slot = plan.slots.find((s) => s.mealType === "lunch");

    // Stale version → conflict.
    const stale = await request(server)
      .patch(`/meal-plans/${plan.id}/slots/${slot?.id}`)
      .set(auth(user))
      .send({ recipeId: recipe.id, expectedVersion: plan.version + 5 });
    expect(stale.status).toBe(409);

    // Correct version → assigned.
    const ok = await request(server)
      .patch(`/meal-plans/${plan.id}/slots/${slot?.id}`)
      .set(auth(user))
      .send({ recipeId: recipe.id, expectedVersion: plan.version });
    expect(ok.status).toBe(200);
    const updated = mealPlanResponseSchema.parse(ok.body.data);
    expect(updated.slots.find((s) => s.id === slot?.id)?.recipeId).toBe(
      recipe.id,
    );
  });

  it("imports from a URL as a draft and only creates on confirm", async () => {
    const user = await registerUser();
    const before = await request(server).get("/recipes").set(auth(user));
    const beforeCount = before.body.data.length as number;

    const imported = await request(server)
      .post("/recipes/import-from-url")
      .set(auth(user))
      .send({ url: "https://example.com/pancakes" });
    expect(imported.status).toBe(200);
    const importBody = importFromUrlResponseSchema.parse(imported.body.data);
    expect(importBody.degraded).toBe(false);
    expect(importBody.draft?.name).toBe("Imported Pancakes");
    expect(importBody.draft?.mealType).toBe("breakfast");
    expect(importBody.draft?.ingredients).toHaveLength(2);

    // Import alone must NOT have created a recipe.
    const afterImport = await request(server).get("/recipes").set(auth(user));
    expect(afterImport.body.data.length).toBe(beforeCount);

    const confirmed = await request(server)
      .post("/recipes/imports/confirm")
      .set(auth(user))
      .send({ draft: importBody.draft });
    expect(confirmed.status).toBe(201);
    const recipe = recipeResponseSchema.parse(confirmed.body.data);
    expect(recipe.sourceType).toBe("import");
    expect(recipe.name).toBe("Imported Pancakes");

    const afterConfirm = await request(server).get("/recipes").set(auth(user));
    expect(afterConfirm.body.data.length).toBe(beforeCount + 1);
  });

  it("degrades external search without a Google key", async () => {
    const user = await registerUser();
    const res = await request(server)
      .get("/recipes/external-search?q=noodles")
      .set(auth(user));
    expect(res.status).toBe(200);
    expect(res.body.data.degraded).toBe(true);
    expect(res.body.data.results).toHaveLength(0);
  });
});
