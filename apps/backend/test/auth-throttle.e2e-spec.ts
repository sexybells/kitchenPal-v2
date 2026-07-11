import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { startInMemoryMongo } from "./in-memory-mongo";

// The general limit is set high so only the per-route auth throttle can trip,
// proving the credential endpoints carry their own stricter cap.
const GENERAL_LIMIT = 1000;
const LOGIN_ROUTE_LIMIT = 10;

describe("Auth rate limiting (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    process.env.THROTTLE_LIMIT = String(GENERAL_LIMIT);
    process.env.THROTTLE_TTL = "60000";
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

  it("throttles repeated login attempts below the general limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_ROUTE_LIMIT + 3; i += 1) {
      const res = await request(server)
        .post("/auth/login")
        .send({ email: "attacker@example.com", password: "guessing" });
      statuses.push(res.status);
    }

    // The per-route cap trips well before the general limit would.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(LOGIN_ROUTE_LIMIT);
  });
});
