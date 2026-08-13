import { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { suggestionsResponseSchema } from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Model } from "mongoose";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { SYSTEM_RECIPES } from "../src/modules/recipes/data/system-recipes.data";
import { Recipe } from "../src/modules/recipes/schemas/recipe.schema";
import { SystemRecipeSeederService } from "../src/modules/recipes/services/system-recipe-seeder.service";
import { startInMemoryReplSet } from "./in-memory-mongo";

/**
 * Proves the seeded library against a real MongoDB: that seeding converges
 * instead of duplicating, that a removed dish stays removed, and — the point of
 * the whole exercise — that a brand-new user with an empty pantry immediately
 * gets suggestions and a filled meal plan.
 */
describe("System recipe seeding (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let recipeModel: Model<Recipe>;
  let seeder: SystemRecipeSeederService;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    // No AI keys: ranking degrades to the deterministic heuristic.
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
    recipeModel = app.get<Model<Recipe>>(getModelToken(Recipe.name));
    seeder = app.get(SystemRecipeSeederService);
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  async function registerUser(): Promise<string> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `seed-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Seed User",
      });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  function countLiveSystemRecipes(): Promise<number> {
    return recipeModel
      .countDocuments({ scope: "system", deletedAt: null })
      .exec();
  }

  it("seeds the whole library, then converges on a re-run", async () => {
    const first = await seeder.seed();
    expect(first.created).toBe(SYSTEM_RECIPES.length);
    expect(await countLiveSystemRecipes()).toBe(SYSTEM_RECIPES.length);

    const second = await seeder.seed();
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    // No duplicates: re-running is a no-op, not a second insert pass.
    expect(await countLiveSystemRecipes()).toBe(SYSTEM_RECIPES.length);
  });

  it("does not resurrect a system recipe an admin removed", async () => {
    const victim = await recipeModel
      .findOne({ scope: "system", deletedAt: null })
      .exec();
    expect(victim).not.toBeNull();
    await recipeModel
      .updateOne({ _id: victim?._id }, { $set: { deletedAt: new Date() } })
      .exec();

    const result = await seeder.seed();

    expect(result.created).toBe(0);
    expect(await countLiveSystemRecipes()).toBe(SYSTEM_RECIPES.length - 1);
    // And the removed dish was not re-inserted under a second document.
    const copies = await recipeModel
      .countDocuments({
        normalizedName: victim?.get("normalizedName") as string,
        scope: "system",
      })
      .exec();
    expect(copies).toBe(1);
  });

  it("keeps a curated dish photo across a re-seed", async () => {
    // Seeds ship with imageUrl null and get real photography attached later via
    // the admin console. Re-seeding must never wipe that.
    const target = await recipeModel
      .findOne({ scope: "system", deletedAt: null })
      .exec();
    const photo = "https://cdn.example.com/pho-bo.jpg";
    await recipeModel
      .updateOne({ _id: target?._id }, { $set: { imageUrl: photo } })
      .exec();

    await seeder.seed();

    const after = await recipeModel.findById(target?._id).exec();
    expect(after?.imageUrl).toBe(photo);
  });

  it("gives a brand-new user real suggestions with an empty pantry", async () => {
    const token = await registerUser();

    const res = await request(server)
      .post("/recipes/ai-suggestions/preferences")
      .set({ Authorization: `Bearer ${token}` })
      .send({ mealType: "dinner", limit: 5 });

    expect(res.status).toBe(200);
    const body = suggestionsResponseSchema.parse(res.body.data);
    expect(body.suggestions.length).toBe(5);
    // Seeded dinners only — the user owns no recipes of their own yet.
    for (const suggestion of body.suggestions) {
      expect(suggestion.mealType).toBe("dinner");
    }
  });

  it("keeps a vegetarian preference on a non-empty candidate pool", async () => {
    const token = await registerUser();
    const auth = { Authorization: `Bearer ${token}` };

    const saved = await request(server)
      .patch("/recipes/preferences")
      .set(auth)
      .send({ diet: "chay" });
    expect(saved.status).toBe(200);

    const res = await request(server)
      .post("/recipes/ai-suggestions/preferences")
      .set(auth)
      .send({ limit: 10 });

    expect(res.status).toBe(200);
    const body = suggestionsResponseSchema.parse(res.body.data);
    expect(body.suggestions.length).toBeGreaterThan(0);
    // Every suggestion must come from the vegetarian side of the library.
    const vegetarianNames = new Set(
      SYSTEM_RECIPES.filter((recipe) => recipe.tags.includes("chay")).map(
        (recipe) => recipe.name,
      ),
    );
    for (const suggestion of body.suggestions) {
      expect(vegetarianNames.has(suggestion.name)).toBe(true);
    }
  });
});
