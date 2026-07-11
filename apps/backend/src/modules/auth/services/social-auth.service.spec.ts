import { UnauthorizedException } from "@nestjs/common";
import { AppLogger } from "../../../common/logging/app-logger.service";
import type { AppConfig } from "../../../config/env.schema";
import { SocialAuthService } from "./social-auth.service";

function makeService(overrides: Partial<AppConfig>): SocialAuthService {
  const config = {
    NODE_ENV: "development",
    LOG_LEVEL: "silent",
    ...overrides,
  } as unknown as AppConfig;
  return new SocialAuthService(config, new AppLogger(config));
}

describe("SocialAuthService", () => {
  it("accepts a well-formed development token when no client IDs are set", async () => {
    const service = makeService({ NODE_ENV: "development" });
    const identity = await service.verify(
      "google",
      JSON.stringify({ sub: "abc", email: "dev@example.com", name: "Dev" }),
    );
    expect(identity.providerId).toBe("abc");
    expect(identity.email).toBe("dev@example.com");
  });

  it("fails closed in production when no client IDs are configured", async () => {
    const service = makeService({ NODE_ENV: "production" });
    await expect(
      service.verify("google", JSON.stringify({ sub: "abc" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.verify("apple", JSON.stringify({ sub: "abc" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a malformed development token", async () => {
    const service = makeService({ NODE_ENV: "development" });
    await expect(service.verify("google", "not-json")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
