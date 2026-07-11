import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, tokenPairSchema } from "../auth.js";
import { successEnvelope } from "../envelope.js";
import { dataScopeSchema } from "../scope.js";
import { z } from "zod";

describe("api-contract", () => {
  it("accepts a valid registration and applies default locale", () => {
    const parsed = registerSchema.parse({
      email: "a@b.com",
      password: "supersecret",
      displayName: "Hai",
    });
    expect(parsed.locale).toBe("vi");
  });

  it("rejects short passwords", () => {
    expect(() =>
      loginSchema.parse({ email: "a@b.com", password: "short" }),
    ).toThrow();
  });

  it("wraps data in the success envelope shape", () => {
    const schema = successEnvelope(tokenPairSchema);
    const value = schema.parse({
      data: { accessToken: "a", refreshToken: "r", expiresIn: 900 },
      meta: { requestId: "req-1" },
    });
    expect(value.meta.requestId).toBe("req-1");
  });

  it("enforces the three data scopes", () => {
    expect(dataScopeSchema.options).toEqual([
      "personal",
      "household",
      "system",
    ]);
    expect(() =>
      z.object({ scope: dataScopeSchema }).parse({ scope: "global" }),
    ).toThrow();
  });
});
