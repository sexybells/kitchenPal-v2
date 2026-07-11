import { envSchema } from "./env.schema";

describe("envSchema production guardrails", () => {
  it("accepts development with no Redis and a localhost Mongo", () => {
    const result = envSchema.safeParse({ NODE_ENV: "development" });
    expect(result.success).toBe(true);
  });

  it("rejects production without REDIS_URL", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "REDIS_URL")).toBe(
        true,
      );
    }
  });

  it("rejects production with a localhost MONGODB_URI", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://127.0.0.1:27017/kitchenpal",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "MONGODB_URI")).toBe(
        true,
      );
    }
  });

  it("rejects production when MONGODB_URI is unset (localhost default)", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
    });
    expect(result.success).toBe(false);
  });

  it("accepts production with real Redis and non-localhost Mongo", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
    });
    expect(result.success).toBe(true);
  });
});
