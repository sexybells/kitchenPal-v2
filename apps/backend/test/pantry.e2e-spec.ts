import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  pantryItemResponseSchema,
  pantryScanResponseSchema,
  consumeResultSchema,
  cookResultSchema,
  refillSuggestionsResponseSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryReplSet } from "./in-memory-mongo";

/** Minimal payload whose leading bytes identify it as a PNG to the scanner. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe("Pantry (e2e)", () => {
  let app: INestApplication;
  // A replica set is required for the transactional consume/cook paths.
  let mongo: MongoMemoryReplSet;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let uploadDir: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = "1000";
    process.env.THROTTLE_TTL = "60000";
    uploadDir = mkdtempSync(join(tmpdir(), "kitchenpal-pantry-"));
    process.env.UPLOAD_DIR = uploadDir;
    // No AI keys: scans must degrade to manual entry, never crash.
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
    if (uploadDir) {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  async function registerUser(): Promise<string> {
    const res = await request(server)
      .post("/auth/register")
      .send({
        email: `pantry-${Math.random().toString(36).slice(2)}@example.com`,
        password: "supersecret",
        displayName: "Pantry User",
      });
    expect(res.status).toBe(201);
    return res.body.data.tokens.accessToken as string;
  }

  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function createItem(
    token: string,
    body: Record<string, unknown>,
  ): Promise<ReturnType<typeof pantryItemResponseSchema.parse>> {
    const res = await request(server)
      .post("/pantry/items")
      .set(auth(token))
      .send(body);
    expect(res.status).toBe(201);
    return pantryItemResponseSchema.parse(res.body.data);
  }

  it("creates, lists, and filters pantry items", async () => {
    const token = await registerUser();
    await createItem(token, { name: "Milk", category: "Dairy" });
    await createItem(token, { name: "Rice", category: "Grains" });

    const all = await request(server)
      .get("/pantry/items")
      .set(auth(token));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta.page.total).toBe(2);

    const dairy = await request(server)
      .get("/pantry/items?category=Dairy")
      .set(auth(token));
    expect(dairy.body.data).toHaveLength(1);
    expect(dairy.body.data[0].name).toBe("Milk");

    const search = await request(server)
      .get("/pantry/items?search=ric")
      .set(auth(token));
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe("Rice");
  });

  it("depletes quantity and flips stock state some→low→out on consume", async () => {
    const token = await registerUser();
    const item = await createItem(token, {
      name: "Eggs",
      category: "Dairy",
      quantity: 4,
      unit: "pcs",
      trackingMode: "exact",
      stockState: "plenty",
    });

    const first = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({ items: [{ pantryItemId: item.id, quantity: 1 }] });
    expect(first.status).toBe(200);
    const afterFirst = consumeResultSchema.parse(first.body.data);
    expect(afterFirst.updated[0]?.quantity).toBe(3);
    expect(afterFirst.updated[0]?.stockState).toBe("some");
    expect(afterFirst.depleted).toHaveLength(0);

    const second = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({ items: [{ pantryItemId: item.id, quantity: 2 }] });
    const afterSecond = consumeResultSchema.parse(second.body.data);
    expect(afterSecond.updated[0]?.quantity).toBe(1);
    expect(afterSecond.updated[0]?.stockState).toBe("low");
    expect(afterSecond.depleted).toHaveLength(1);

    const third = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({ items: [{ pantryItemId: item.id, quantity: 5 }] });
    const afterThird = consumeResultSchema.parse(third.body.data);
    expect(afterThird.updated[0]?.quantity).toBe(0);
    expect(afterThird.updated[0]?.stockState).toBe("out");
  });

  it("steps a state-only item down without a quantity", async () => {
    const token = await registerUser();
    const item = await createItem(token, {
      name: "Salt",
      category: "Pantry",
      stockState: "plenty",
    });

    const res = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({ items: [{ pantryItemId: item.id }] });
    expect(
      consumeResultSchema.parse(res.body.data).updated[0]?.stockState,
    ).toBe("some");
  });

  it("returns low/out items as refill suggestions, out first", async () => {
    const token = await registerUser();
    await createItem(token, { name: "Plenty", category: "X", stockState: "plenty" });
    await createItem(token, { name: "Low", category: "X", stockState: "low" });
    await createItem(token, { name: "Out", category: "X", stockState: "out" });

    const res = await request(server)
      .get("/pantry/refill-suggestions")
      .set(auth(token));
    expect(res.status).toBe(200);
    const { suggestions } = refillSuggestionsResponseSchema.parse(res.body.data);
    expect(suggestions.map((s) => s.name)).toEqual(["Out", "Low"]);
  });

  it("sorts by soonest expiry with no-expiry items last", async () => {
    const token = await registerUser();
    await createItem(token, {
      name: "Later",
      category: "X",
      expiryDate: "2027-01-01T00:00:00.000Z",
    });
    await createItem(token, { name: "NoExpiry", category: "X" });
    await createItem(token, {
      name: "Sooner",
      category: "X",
      expiryDate: "2026-08-01T00:00:00.000Z",
    });

    const res = await request(server)
      .get("/pantry/items?sort=expiry")
      .set(auth(token));
    // Soonest-expiring first; items with no expiry come last (Home "expiring soon").
    expect(res.body.data.map((i: { name: string }) => i.name)).toEqual([
      "Sooner",
      "Later",
      "NoExpiry",
    ]);
  });

  it("scans without AI keys, degrades to manual entry, and confirms items", async () => {
    const token = await registerUser();
    const scanRes = await request(server)
      .post("/pantry/scans")
      .set(auth(token))
      .attach("file", PNG_BYTES, { filename: "shelf.png", contentType: "image/png" });
    expect(scanRes.status).toBe(201);
    const scan = pantryScanResponseSchema.parse(scanRes.body.data);
    expect(scan.status).toBe("ready");
    expect(scan.degraded).toBe(true);
    expect(scan.provider).toBe("none");
    expect(scan.detections).toHaveLength(0);

    const fetched = await request(server)
      .get(`/pantry/scans/${scan.id}`)
      .set(auth(token));
    expect(fetched.status).toBe(200);

    const confirmRes = await request(server)
      .post(`/pantry/scans/${scan.id}/confirm`)
      .set(auth(token))
      .send({
        items: [
          { name: "Tomato", category: "Vegetables", stockState: "some" },
          { name: "Onion", category: "Vegetables" },
        ],
      });
    expect(confirmRes.status).toBe(201);
    const confirmed = pantryScanResponseSchema.parse(confirmRes.body.data);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.materializedItemIds).toHaveLength(2);

    const items = await request(server)
      .get("/pantry/items?search=Tomato")
      .set(auth(token));
    expect(items.body.data).toHaveLength(1);
    expect(items.body.data[0].source).toBe("scan");

    // Re-confirming a confirmed scan is rejected.
    const reconfirm = await request(server)
      .post(`/pantry/scans/${scan.id}/confirm`)
      .set(auth(token))
      .send({ items: [{ name: "Extra", category: "X" }] });
    expect(reconfirm.status).toBe(409);
  });

  it("rejects a non-image scan payload", async () => {
    const token = await registerUser();
    const res = await request(server)
      .post("/pantry/scans")
      .set(auth(token))
      .attach("file", Buffer.from("not an image"), {
        filename: "note.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
  });

  it("runs the cook loop: depletes matched ingredients and suggests refills", async () => {
    const token = await registerUser();
    const flour = await createItem(token, {
      name: "Flour",
      category: "Baking",
      quantity: 2,
      unit: "cups",
      trackingMode: "exact",
    });

    const res = await request(server)
      .post("/pantry/cook")
      .set(auth(token))
      .send({
        ingredients: [
          { pantryItemId: flour.id, name: "Flour", quantity: 2 },
          { name: "Sugar", quantity: 1 },
        ],
      });
    expect(res.status).toBe(200);
    const cook = cookResultSchema.parse(res.body.data);
    expect(cook.consumed).toHaveLength(1);
    expect(cook.consumed[0]?.stockState).toBe("out");
    expect(cook.unmatched).toEqual([{ name: "Sugar" }]);
    expect(cook.refillSuggestions.map((s) => s.name)).toContain("Flour");
  });

  it("consume is all-or-nothing: a missing item leaves the rest unchanged", async () => {
    const token = await registerUser();
    const keep = await createItem(token, {
      name: "Keep",
      category: "X",
      quantity: 4,
      trackingMode: "exact",
    });
    const missingId = "0123456789abcdef01234567";

    const res = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({
        items: [
          { pantryItemId: keep.id, quantity: 1 },
          { pantryItemId: missingId, quantity: 1 },
        ],
      });
    expect(res.status).toBe(404);

    // The first item must NOT have been depleted — the whole batch rolled back.
    const after = await request(server)
      .get("/pantry/items?search=Keep")
      .set(auth(token));
    expect(after.body.data[0].quantity).toBe(4);
    expect(after.body.data[0].stockState).toBe("plenty");
  });

  it("cook is all-or-nothing: a bad explicit id leaves matched items unchanged", async () => {
    const token = await registerUser();
    const flour = await createItem(token, {
      name: "Flour",
      category: "Baking",
      quantity: 4,
      trackingMode: "exact",
    });
    const missingId = "0123456789abcdef01234567";

    const res = await request(server)
      .post("/pantry/cook")
      .set(auth(token))
      .send({
        ingredients: [
          { pantryItemId: flour.id, name: "Flour", quantity: 2 },
          { pantryItemId: missingId, name: "Ghost", quantity: 1 },
        ],
      });
    expect(res.status).toBe(404);

    const after = await request(server)
      .get("/pantry/items?search=Flour")
      .set(auth(token));
    expect(after.body.data[0].quantity).toBe(4);
  });

  it("materializes items exactly once under concurrent confirm", async () => {
    const token = await registerUser();
    const scanRes = await request(server)
      .post("/pantry/scans")
      .set(auth(token))
      .attach("file", PNG_BYTES, { filename: "shelf.png", contentType: "image/png" });
    const scan = pantryScanResponseSchema.parse(scanRes.body.data);

    const body = {
      items: [
        { name: "Carrot", category: "Vegetables" },
        { name: "Potato", category: "Vegetables" },
      ],
    };
    const [a, b] = await Promise.all([
      request(server)
        .post(`/pantry/scans/${scan.id}/confirm`)
        .set(auth(token))
        .send(body),
      request(server)
        .post(`/pantry/scans/${scan.id}/confirm`)
        .set(auth(token))
        .send(body),
    ]);

    // Exactly one confirm wins; the other is rejected and materializes nothing.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const items = await request(server)
      .get("/pantry/items")
      .set(auth(token));
    expect(items.body.meta.page.total).toBe(2);
  });

  it("dedupes a repeated consume carrying the same idempotency key", async () => {
    const token = await registerUser();
    const item = await createItem(token, {
      name: "Oil",
      category: "Pantry",
      quantity: 5,
      trackingMode: "exact",
    });
    const payload = {
      items: [{ pantryItemId: item.id, quantity: 1 }],
      idempotencyKey: "retry-key-1",
    };

    const first = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send(payload);
    const second = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send(payload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // Depleted once (5 → 4), not twice, despite the repeated request.
    const after = await request(server)
      .get("/pantry/items?search=Oil")
      .set(auth(token));
    expect(after.body.data[0].quantity).toBe(4);
  });

  it("rejects a malformed pantryItemId with 400, not 500", async () => {
    const token = await registerUser();
    const res = await request(server)
      .post("/pantry/consume")
      .set(auth(token))
      .send({ items: [{ pantryItemId: "not-an-object-id", quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("isolates pantry data across users", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const item = await createItem(owner, { name: "Secret", category: "X" });

    const list = await request(server)
      .get("/pantry/items")
      .set(auth(other));
    expect(list.body.data).toHaveLength(0);

    const patch = await request(server)
      .patch(`/pantry/items/${item.id}`)
      .set(auth(other))
      .send({ name: "Hijacked" });
    expect(patch.status).toBe(404);

    const del = await request(server)
      .delete(`/pantry/items/${item.id}`)
      .set(auth(other));
    expect(del.status).toBe(404);

    // The owner still sees the untouched item.
    const ownerList = await request(server)
      .get("/pantry/items")
      .set(auth(owner));
    expect(ownerList.body.data[0].name).toBe("Secret");
  });
});
