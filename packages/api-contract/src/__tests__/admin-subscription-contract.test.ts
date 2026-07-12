import { describe, it, expect } from "vitest";
import {
  createPlanSchema,
  selfActivateResultSchema,
  assignSubscriptionSchema,
  subscriptionTierSchema,
} from "../subscription.js";
import {
  adminListQuerySchema,
  adminSuspendUserSchema,
  reportRangeQuerySchema,
  updateSettingSchema,
} from "../admin.js";
import { householdJoinResultSchema } from "../household.js";

describe("subscription contract", () => {
  it("defaults a new plan to active with an empty feature list", () => {
    const plan = createPlanSchema.parse({
      name: "Pro",
      tier: "pro",
      priceVnd: 99000,
    });
    expect(plan.active).toBe(true);
    expect(plan.features).toEqual([]);
  });

  it("rejects a negative VND price", () => {
    expect(() =>
      createPlanSchema.parse({ name: "Bad", tier: "pro", priceVnd: -1 }),
    ).toThrow();
  });

  it("models self-activation as an inert contact-required result", () => {
    const result = selfActivateResultSchema.parse({
      activated: false,
      status: "contact_required",
      message: "Liên hệ để nâng cấp",
    });
    expect(result.activated).toBe(false);
  });

  it("requires object ids on admin assignment", () => {
    expect(() =>
      assignSubscriptionSchema.parse({ userId: "not-an-id", planId: "x" }),
    ).toThrow();
  });

  it("exposes only free and pro tiers", () => {
    expect(subscriptionTierSchema.options).toEqual(["free", "pro"]);
  });
});

describe("admin contract", () => {
  it("coerces and bounds the admin list page size", () => {
    const query = adminListQuerySchema.parse({ limit: "50" });
    expect(query.limit).toBe(50);
  });

  it("defaults report buckets to day granularity", () => {
    expect(reportRangeQuerySchema.parse({}).bucket).toBe("day");
  });

  it("requires a boolean suspend flag", () => {
    expect(() => adminSuspendUserSchema.parse({})).toThrow();
    expect(adminSuspendUserSchema.parse({ suspended: true }).suspended).toBe(
      true,
    );
  });

  it("defaults setting config to an empty object", () => {
    expect(updateSettingSchema.parse({ enabled: false }).config).toEqual({});
  });
});

describe("household join result contract", () => {
  it("extends the household response with a fresh token pair", () => {
    const parsed = householdJoinResultSchema.parse({
      id: "h1",
      name: "Home",
      ownerUserId: "u1",
      membersCount: 1,
      myRole: "owner",
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokens: { accessToken: "a", refreshToken: "r", expiresIn: 900 },
    });
    expect(parsed.tokens.accessToken).toBe("a");
    expect(parsed.id).toBe("h1");
  });
});
