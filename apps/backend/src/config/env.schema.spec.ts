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

  it("rejects production without a JWT access secret", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "JWT_ACCESS_SECRET"),
      ).toBe(true);
    }
  });

  it("rejects production without a socket CORS allowlist", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
      JWT_ACCESS_SECRET: "a-strong-production-secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "SOCKET_CORS_ORIGINS"),
      ).toBe(true);
    }
  });

  it("rejects production with STORAGE_PROVIDER=local", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
      JWT_ACCESS_SECRET: "a-strong-production-secret",
      SOCKET_CORS_ORIGINS: "https://app.kitchenpal.example",
      STORAGE_PROVIDER: "local",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "STORAGE_PROVIDER"),
      ).toBe(true);
    }
  });

  it("rejects production with STORAGE_PROVIDER=s3 but no bucket/region", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
      JWT_ACCESS_SECRET: "a-strong-production-secret",
      SOCKET_CORS_ORIGINS: "https://app.kitchenpal.example",
      STORAGE_PROVIDER: "s3",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "S3_BUCKET")).toBe(
        true,
      );
      expect(result.error.issues.some((i) => i.path[0] === "S3_REGION")).toBe(
        true,
      );
    }
  });

  it("accepts production with real Redis, non-localhost Mongo, a JWT secret, a socket allowlist, and S3 storage", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "production",
      REDIS_URL: "redis://cache.internal:6379",
      MONGODB_URI: "mongodb://db.internal:27017/kitchenpal",
      JWT_ACCESS_SECRET: "a-strong-production-secret",
      SOCKET_CORS_ORIGINS: "https://app.kitchenpal.example",
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "kitchenpal-prod-uploads",
      S3_REGION: "ap-southeast-1",
    });
    expect(result.success).toBe(true);
  });
});
