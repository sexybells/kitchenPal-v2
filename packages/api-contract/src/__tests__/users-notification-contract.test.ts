import { describe, it, expect } from "vitest";
import {
  isValidTimeZone,
  notificationTypeSchema,
  updateSettingsSchema,
  userSettingsResponseSchema,
} from "../index.js";

describe("settings contract: vegetarian days and time zone", () => {
  it("rejects an unknown time zone", () => {
    expect(updateSettingsSchema.safeParse({ timeZone: "Mars/Base" }).success).toBe(false);
  });

  it("accepts a valid time zone with observesVegetarianDays", () => {
    const parsed = updateSettingsSchema.parse({
      timeZone: "Europe/Berlin",
      observesVegetarianDays: true,
    });
    expect(parsed.timeZone).toBe("Europe/Berlin");
    expect(parsed.observesVegetarianDays).toBe(true);
  });

  it("requires the new fields on the settings response", () => {
    const base = {
      locale: "vi",
      measurementSystem: "metric",
      theme: "system",
      notifications: { push: true, email: true, mealReminders: true, shoppingReminders: true },
      biometricLockEnabled: false,
    };
    expect(userSettingsResponseSchema.safeParse(base).success).toBe(false);
    expect(
      userSettingsResponseSchema.safeParse({
        ...base,
        observesVegetarianDays: false,
        timeZone: "Asia/Ho_Chi_Minh",
      }).success,
    ).toBe(true);
  });

  it("exports isValidTimeZone", () => {
    expect(isValidTimeZone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("notification contract", () => {
  it("accepts the vegetarian_day type", () => {
    expect(notificationTypeSchema.parse("vegetarian_day")).toBe("vegetarian_day");
  });
});
