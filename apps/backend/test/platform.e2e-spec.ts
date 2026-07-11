import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  errorEnvelopeSchema,
  metaSchema,
} from "@kitchenpal/api-contract";
import type { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { z } from "zod";
import { AppModule } from "../src/app.module";
import { startInMemoryMongo } from "./in-memory-mongo";

const THROTTLE_LIMIT = 3;

const healthEnvelope = z.object({
  data: z.object({
    status: z.enum(["ok", "degraded"]),
    uptimeSeconds: z.number(),
    mongo: z.string(),
  }),
  meta: metaSchema,
});

describe("Core platform (e2e)", () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);
    process.env.THROTTLE_TTL = "60000";
    process.env.SWAGGER_ENABLED = "false";
    mongo = await startInMemoryMongo();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it("GET /health returns 200 with the success envelope", async () => {
    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    const parsed = healthEnvelope.parse(res.body);
    expect(parsed.data.status).toBe("ok");
    expect(parsed.meta.requestId).toEqual(res.headers["x-request-id"]);
  });

  it("returns 429 with the error envelope once the rate limit is exceeded", async () => {
    let lastStatus = 0;
    let lastBody: unknown;

    for (let i = 0; i < THROTTLE_LIMIT + 1; i += 1) {
      const res = await request(app.getHttpServer()).get("/health/ready");
      lastStatus = res.status;
      lastBody = res.body;
    }

    expect(lastStatus).toBe(429);
    const parsed = errorEnvelopeSchema.parse(lastBody);
    expect(parsed.error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(parsed.meta.requestId).toBeTruthy();
  });

  it("returns the error envelope shape for a validation failure", async () => {
    const res = await request(app.getHttpServer()).get("/health/echo?limit=0");

    expect(res.status).toBe(400);
    const parsed = errorEnvelopeSchema.parse(res.body);
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(parsed.error.details).toBeDefined();
    expect(parsed.meta.requestId).toBeTruthy();
  });
});
